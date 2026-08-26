import {
  AuthStorage,
  getOAuthProviders,
  PASTE_CODE_LOGIN_PROVIDERS,
  SqliteAuthCredentialStore,
  type OAuthProvider,
} from "@oh-my-pi/pi-ai";

const loginSessionTtlMs = 10 * 60 * 1000;

type LoginState = "pending" | "done" | "error";

interface LoginSession {
  state: LoginState;
  needsCode: boolean;
  message?: string;
  url?: string;
  instructions?: string;
  inputPromise?: Promise<string>;
  resolveInput?: (code: string) => void;
  rejectInput?: (error: Error) => void;
}

export interface ControlContext {
  brokerBase: string;
  sessions: Map<string, LoginSession>;
  storage: AuthStorage;
  store: SqliteAuthCredentialStore;
}

export async function controlApi(
  request: Request,
  context: ControlContext,
): Promise<Response> {
  try {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/providers") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }
      return json(
        getOAuthProviders().map((provider) => ({
          id: provider.id,
          name: provider.name,
          pasteCode: PASTE_CODE_LOGIN_PROVIDERS.has(provider.id),
        })),
      );
    }

    if (pathname === "/api/snapshot") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }
      return forwardUpstream(
        await fetch(`${context.brokerBase}/v1/snapshot`),
      );
    }

    if (pathname === "/api/usage") {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }
      return usage(context);
    }

    if (pathname === "/api/login") {
      if (request.method !== "POST") {
        return methodNotAllowed("POST");
      }
      return login(request, context);
    }

    const statusMatch = /^\/api\/login\/([^/]+)\/status$/.exec(pathname);
    if (statusMatch) {
      if (request.method !== "GET") {
        return methodNotAllowed("GET");
      }
      return loginStatus(statusMatch[1], context);
    }

    const codeMatch = /^\/api\/login\/([^/]+)\/code$/.exec(pathname);
    if (codeMatch) {
      if (request.method !== "POST") {
        return methodNotAllowed("POST");
      }
      return loginCode(codeMatch[1], request, context);
    }

    if (pathname === "/api/logout") {
      if (request.method !== "POST") {
        return methodNotAllowed("POST");
      }
      return logout(request, context);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

async function usage(context: ControlContext): Promise<Response> {
  const sinceMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const [usageResponse, clientsResponse] = await Promise.all([
    fetch(`${context.brokerBase}/v1/usage`),
    fetch(`${context.brokerBase}/v1/usage/clients?sinceMs=${sinceMs}`),
  ]);

  if (!usageResponse.ok || !clientsResponse.ok) {
    return json({ error: "The internal broker could not provide usage data" }, 502);
  }

  const [usagePayload, clientsPayload] = (await Promise.all([
    usageResponse.json(),
    clientsResponse.json(),
  ])) as [
    { generatedAt: unknown; reports: unknown },
    { clients: unknown },
  ];

  return json({
    clients: clientsPayload.clients,
    generatedAt: usagePayload.generatedAt,
    reports: usagePayload.reports,
  });
}

async function login(
  request: Request,
  context: ControlContext,
): Promise<Response> {
  const provider = await readProvider(request);
  if (provider instanceof Response) {
    return provider;
  }

  const sessionId = crypto.randomUUID();
  const session: LoginSession = {
    needsCode: false,
    state: "pending",
  };
  context.sessions.set(sessionId, session);
  setTimeout(() => {
    const expiredSession = context.sessions.get(sessionId);
    if (expiredSession) {
      expiredSession.rejectInput?.(new Error("Login session expired"));
      context.sessions.delete(sessionId);
    }
  }, loginSessionTtlMs);

  let settledStart = false;
  let resolveStart: (value: {
    sessionId: string;
    url: string;
    instructions?: string;
    needsCode: boolean;
  }) => void;
  let rejectStart: (reason?: unknown) => void;
  const started = new Promise<{
    sessionId: string;
    url: string;
    instructions?: string;
    needsCode: boolean;
  }>((resolve, reject) => {
    resolveStart = resolve;
    rejectStart = reject;
  });

  const completeStart = () => {
    if (settledStart || !session.url) {
      return;
    }
    settledStart = true;
    resolveStart({
      sessionId,
      url: session.url,
      ...(session.instructions ? { instructions: session.instructions } : {}),
      needsCode: session.needsCode,
    });
  };
  const failStart = (error: unknown) => {
    if (settledStart) {
      return;
    }
    settledStart = true;
    rejectStart(error);
  };

  const controller = {
    onAuth: (auth) => {
      if (!auth.url) {
        const error = new Error("OAuth provider did not provide an authorization URL");
        session.state = "error";
        session.message = error.message;
        failStart(error);
        return;
      }

      session.url = auth.url;
      session.instructions = auth.instructions;
      completeStart();
    },
    onProgress: (progress) => {
      if (progress) {
        session.message = session.message
          ? `${session.message}\n${progress}`
          : progress;
      }
    },
    onPrompt: async ({ message }) => {
      if (message) {
        session.message = session.message
          ? `${session.message}\n${message}`
          : message;
      }
      return PASTE_CODE_LOGIN_PROVIDERS.has(provider) ? waitForCode(session) : "";
    },
    ...(PASTE_CODE_LOGIN_PROVIDERS.has(provider)
      ? { onManualCodeInput: async () => waitForCode(session) }
      : {}),
  } satisfies Parameters<AuthStorage["login"]>[1];

  let loginPromise: Promise<unknown>;
  try {
    loginPromise = Promise.resolve(context.storage.login(provider, controller));
  } catch (error) {
    loginPromise = Promise.reject(error);
  }

  void loginPromise
    .then(() => {
      session.needsCode = false;
      session.state = "done";
    })
    .catch((error: unknown) => {
      session.state = "error";
      session.message = errorMessage(error);
      failStart(error);
    })
    .finally(() => {
      void Promise.resolve(context.storage.reload()).catch((error: unknown) => {
        const message = `Credential reload failed: ${errorMessage(error)}`;
        session.message = session.message
          ? `${session.message}\n${message}`
          : message;
      });
    });

  try {
    return json(await started);
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }
}

function loginStatus(encodedSessionId: string, context: ControlContext): Response {
  const sessionId = decodeURIComponent(encodedSessionId);
  const session = context.sessions.get(sessionId);
  if (!session) {
    return json({ error: "Login session not found" }, 404);
  }

  return json({
    ...(session.message ? { message: session.message } : {}),
    needsCode: session.needsCode,
    state: session.state,
  });
}

async function loginCode(
  encodedSessionId: string,
  request: Request,
  context: ControlContext,
): Promise<Response> {
  const sessionId = decodeURIComponent(encodedSessionId);
  const session = context.sessions.get(sessionId);
  if (!session || !session.resolveInput) {
    return json({ error: "No code input is pending for this login session" }, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!isRecord(body) || typeof body.code !== "string" || !body.code.trim()) {
    return json({ error: "A non-empty code is required" }, 400);
  }

  const resolveInput = session.resolveInput;
  session.inputPromise = undefined;
  session.needsCode = false;
  session.rejectInput = undefined;
  session.resolveInput = undefined;
  resolveInput(body.code.trim());

  return json({ ok: true });
}

async function logout(
  request: Request,
  context: ControlContext,
): Promise<Response> {
  const provider = await readProvider(request);
  if (provider instanceof Response) {
    return provider;
  }

  await context.store.deleteAuthCredentialsForProvider(
    provider,
    "removed via web ui",
  );
  await context.storage.reload();
  return json({ ok: true });
}

async function readProvider(request: Request): Promise<OAuthProvider | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isRecord(body) || typeof body.provider !== "string") {
    return json({ error: "A provider is required" }, 400);
  }

  const provider = getOAuthProviders().find(
    (candidate) => candidate.id === body.provider,
  );
  if (!provider) {
    return json({ error: "Unknown OAuth provider" }, 400);
  }

  return provider.id as OAuthProvider;
}

function waitForCode(session: LoginSession): Promise<string> {
  if (session.inputPromise) {
    return session.inputPromise;
  }

  session.needsCode = true;
  session.inputPromise = new Promise<string>((resolve, reject) => {
    session.resolveInput = resolve;
    session.rejectInput = reject;
  });
  return session.inputPromise;
}

function forwardUpstream(response: Response): Response {
  return new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function methodNotAllowed(allow: string): Response {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    headers: {
      allow,
      "content-type": "application/json; charset=utf-8",
    },
    status: 405,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
