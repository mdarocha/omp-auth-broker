import { getOAuthProviders, PASTE_CODE_LOGIN_PROVIDERS } from "@oh-my-pi/pi-ai";
import type { OAuthProviderId } from "@oh-my-pi/pi-ai";

import {
    buildLoginController,
    createLoginSession,
    createStartSignal,
    resolveLoginCode,
    runLoginFlow,
} from "./login-session";
import { fetchBroker, forwardUpstream } from "./proxy";
import { isRecord, json, readJsonBody } from "./http";
import type { LoginSession, LoginStartResult } from "./login-session";
import type { ControlContext } from "./control";

export function buildControlRoutes(context: ControlContext) {
    return {
        "/api/login": {
            POST: (request: Request) => loginRoute(request, context),
        },
        "/api/login/:id/code": {
            POST: (request: Bun.BunRequest<"/api/login/:id/code">) => loginCodeRoute(request, context),
        },
        "/api/login/:id/status": {
            GET: (request: Bun.BunRequest<"/api/login/:id/status">) => loginStatusRoute(request, context),
        },
        "/api/logout": {
            POST: (request: Request) => logoutRoute(request, context),
        },
        "/api/providers": {
            GET: providersRoute,
        },
        "/api/snapshot": {
            GET: () => snapshotRoute(context),
        },
        "/api/usage": {
            GET: () => usageRoute(context),
        },
    };
}

function providersRoute(): Response {
    return json(
        getOAuthProviders().map((provider) => ({
            id: provider.id,
            name: provider.name,
            pasteCode: PASTE_CODE_LOGIN_PROVIDERS.has(provider.id),
        })),
    );
}

async function snapshotRoute(context: ControlContext): Promise<Response> {
    return forwardUpstream(await fetchBroker(context.brokerBase, "/v1/snapshot"));
}

interface UsagePayload {
    generatedAt: unknown;
    reports: unknown;
}

interface ClientsPayload {
    clients: unknown;
}

function isUsagePayload(value: unknown): value is UsagePayload {
    return isRecord(value) && "generatedAt" in value && "reports" in value;
}

function isClientsPayload(value: unknown): value is ClientsPayload {
    return isRecord(value) && "clients" in value;
}

async function fetchUsageSnapshot(context: ControlContext): Promise<Response> {
    const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const [usageResponse, clientsResponse] = await Promise.all([
        fetchBroker(context.brokerBase, "/v1/usage"),
        fetchBroker(context.brokerBase, `/v1/usage/clients?sinceMs=${sinceMs}`),
    ]);

    if (!usageResponse.ok || !clientsResponse.ok) {
        return json({ error: "The internal broker could not provide usage data" }, 502);
    }

    const [usagePayload, clientsPayload] = await Promise.all([usageResponse.json(), clientsResponse.json()]);
    if (!isUsagePayload(usagePayload) || !isClientsPayload(clientsPayload)) {
        return json({ error: "The internal broker could not provide usage data" }, 502);
    }

    return json({
        clients: clientsPayload.clients,
        generatedAt: usagePayload.generatedAt,
        reports: usagePayload.reports,
    });
}

async function usageRoute(context: ControlContext): Promise<Response> {
    return fetchUsageSnapshot(context);
}

function startLoginFlow(context: ControlContext, provider: OAuthProviderId): Promise<LoginStartResult> {
    const { sessionId, session } = createLoginSession(context.sessions);
    const { started, resolveStart, failStart } = createStartSignal();

    const completeStart = (): void => {
        if (!session.url) {
            const error = new Error("OAuth provider did not provide an authorization URL");
            session.state = "error";
            session.message = error.message;
            failStart(error);
            return;
        }
        const result: LoginStartResult = {
            sessionId,
            url: session.url,
            ...(session.instructions ? { instructions: session.instructions } : {}),
            needsCode: session.needsCode,
        };
        resolveStart(result);
    };

    const controller = buildLoginController({ completeStart, provider, session });
    runLoginFlow({ completeStart, controller, failStart, provider, session, storage: context.storage });

    return started;
}

async function loginRoute(request: Request, context: ControlContext): Promise<Response> {
    const provider = await readProvider(request);
    if (provider instanceof Response) {
        return provider;
    }

    return json(await startLoginFlow(context, provider));
}

function loginStatusRoute(request: Bun.BunRequest<"/api/login/:id/status">, context: ControlContext): Response {
    const session = context.sessions.get(request.params.id);
    if (!session) {
        return json({ error: "Login session not found" }, 404);
    }

    return json({
        ...(session.message ? { message: session.message } : {}),
        needsCode: session.needsCode,
        state: session.state,
    });
}

async function readLoginCodeSubmission(
    request: Bun.BunRequest<"/api/login/:id/code">,
    context: ControlContext,
): Promise<{ code: string; session: LoginSession } | Response> {
    const session = context.sessions.get(request.params.id);
    if (!session || !session.resolveInput) {
        return json({ error: "No code input is pending for this login session" }, 404);
    }

    const body = await readJsonBody(request);
    if (body instanceof Response) {
        return body;
    }
    if (!isRecord(body) || typeof body.code !== "string" || !body.code.trim()) {
        return json({ error: "A non-empty code is required" }, 400);
    }

    return { code: body.code.trim(), session };
}

async function loginCodeRoute(
    request: Bun.BunRequest<"/api/login/:id/code">,
    context: ControlContext,
): Promise<Response> {
    const submission = await readLoginCodeSubmission(request, context);
    if (submission instanceof Response) {
        return submission;
    }

    resolveLoginCode(submission.session, submission.code);
    return json({ ok: true });
}

async function logoutRoute(request: Request, context: ControlContext): Promise<Response> {
    const provider = await readProvider(request);
    if (provider instanceof Response) {
        return provider;
    }

    context.store.deleteAuthCredentialsForProvider(provider, "removed via web ui");
    await context.storage.reload();
    return json({ ok: true });
}

async function readProvider(request: Request): Promise<OAuthProviderId | Response> {
    const body = await readJsonBody(request);
    if (body instanceof Response) {
        return body;
    }

    if (!isRecord(body) || typeof body.provider !== "string") {
        return json({ error: "A provider is required" }, 400);
    }

    const provider = getOAuthProviders().find((candidate) => candidate.id === body.provider);
    if (!provider) {
        return json({ error: "Unknown OAuth provider" }, 400);
    }

    return provider.id;
}
