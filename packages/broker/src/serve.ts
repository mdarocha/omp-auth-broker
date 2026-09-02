import { AuthStorage, SqliteAuthCredentialStore } from "@oh-my-pi/pi-ai";
import { getAgentDbPath, logger, VERSION } from "@oh-my-pi/pi-utils";
import type { AuthBrokerServerHandle } from "@oh-my-pi/pi-ai/auth-broker";
import type { AuthStorageOptions } from "@oh-my-pi/pi-ai";
import { startAuthBroker } from "@oh-my-pi/pi-ai/auth-broker";

import { cacheMcpRefreshMaterial, isManagedMcpOAuthCredentialId, refreshBrokerOAuthCredential } from "./mcp-refresh";
import { json, rejectDisallowedHost } from "./http";
import { runAsAuthBroker, setLogFormat } from "./logging";
import { buildControlRoutes } from "./routes";

import type { BrokerSettings } from "./settings";
import type { ControlContext } from "./control";
import { loadSettings } from "./settings";
import { logIncomingRequest } from "./request-log";
import { proxyToBroker } from "./proxy";
import uiIndex from "../../ui/index.html";

const LOOPBACK_HOSTNAME = "127.0.0.1";

export interface ServeFlags {
    settings?: string;
}

export interface ServeHandle {
    url: string;
    close: () => Promise<void>;
}

interface AuthState {
    store: SqliteAuthCredentialStore;
    storage: AuthStorage;
}

interface PublicServerOptions {
    allowedHostname?: string;
    context: ControlContext;
    port: number;
}

interface CleanupState {
    failure: unknown;
    hasFailure: boolean;
}

interface ServeResources {
    broker: AuthBrokerServerHandle;
    server: Bun.Server<undefined>;
}

interface StartServeResourcesOptions {
    allowedHostname?: string;
    port: number;
    storage: AuthStorage;
    store: SqliteAuthCredentialStore;
}

async function openAuthStorage(authStorageOptions?: AuthStorageOptions): Promise<AuthState> {
    const store = await SqliteAuthCredentialStore.open(getAgentDbPath());
    for (const entry of store.listAuthCredentials()) {
        if (isManagedMcpOAuthCredentialId(entry.provider) && entry.credential.type === "oauth") {
            cacheMcpRefreshMaterial(entry.provider, entry.credential);
        }
    }
    // `authStorageOptions` can override any of these defaults (e.g. the e2e screenshot suite overrides `fetchUsageReports`).
    // The mcp_oauth:* refresh override must stay the default: the headless broker never loads the MCP manager that would otherwise provide it.
    const storage = new AuthStorage(store, {
        refreshOAuthCredential: (...args) => {
            const [provider, credentialId, credential, signal] = args;
            return refreshBrokerOAuthCredential(provider, credential, { rowId: credentialId, signal, store });
        },
        ...authStorageOptions,
    });
    try {
        await storage.reload();
    } catch (error) {
        await Promise.resolve(storage.close());
        throw error;
    }
    return { store, storage };
}

async function startPublicServer({
    allowedHostname,
    context,
    port,
}: PublicServerOptions): Promise<Bun.Server<undefined>> {
    const controlRoutes = buildControlRoutes(context);
    const routeHandler = <RequestType extends Request>(
        handler: (request: RequestType) => Response | Promise<Response>,
    ) => withRequestLogging(withHostCheck(handler, allowedHostname));
    return Bun.serve({
        hostname: LOOPBACK_HOSTNAME,
        port,
        routes: {
            "/": uiIndex,
            "/api/login": {
                POST: routeHandler(controlRoutes["/api/login"].POST),
            },
            "/api/login/:id/code": {
                POST: routeHandler(controlRoutes["/api/login/:id/code"].POST),
            },
            "/api/login/:id/status": {
                GET: routeHandler(controlRoutes["/api/login/:id/status"].GET),
            },
            "/api/logout": {
                POST: routeHandler(controlRoutes["/api/logout"].POST),
            },
            "/api/providers": {
                GET: routeHandler(controlRoutes["/api/providers"].GET),
            },
            "/api/snapshot": {
                GET: routeHandler(controlRoutes["/api/snapshot"].GET),
            },
            "/api/usage": {
                GET: routeHandler(controlRoutes["/api/usage"].GET),
            },
            "/v1": routeHandler((request: Request) => proxyToBroker(request, context.brokerBase)),
            "/v1/*": routeHandler((request: Request) => proxyToBroker(request, context.brokerBase)),
        },
        fetch: routeHandler(dispatch),
        error(error) {
            logger.error("omp-auth-broker request failed", {
                error: error instanceof Error ? error.message : String(error),
            });
            return json({ error: "Internal Server Error" }, 500);
        },
    });
}

async function closeResources(
    server: Bun.Server<undefined> | undefined,
    broker: AuthBrokerServerHandle | undefined,
    storage: AuthStorage | undefined,
): Promise<void> {
    const state: CleanupState = { failure: undefined, hasFailure: false };
    await closeResource(server ? () => server.stop(true) : undefined, state);
    await closeResource(broker ? () => broker.close() : undefined, state);
    await closeResource(storage ? () => storage.close() : undefined, state);
    if (state.hasFailure) {
        throw state.failure;
    }
}

async function closeResource(operation: (() => unknown) | undefined, state: CleanupState): Promise<void> {
    if (!operation) {
        return;
    }
    try {
        await operation();
    } catch (error) {
        if (!state.hasFailure) {
            state.failure = error;
            state.hasFailure = true;
        }
    }
}

function startBroker(storage: AuthStorage): AuthBrokerServerHandle {
    return runAsAuthBroker(() =>
        startAuthBroker({
            storage,
            bind: "127.0.0.1:0",
            bearerTokens: [],
            version: VERSION,
        }),
    );
}

function createControlContext(
    store: SqliteAuthCredentialStore,
    storage: AuthStorage,
    broker: AuthBrokerServerHandle,
): ControlContext {
    return {
        brokerBase: `http://127.0.0.1:${broker.port}`,
        sessions: new Map(),
        storage,
        store,
    };
}

async function startServeResources({
    allowedHostname,
    port,
    storage,
    store,
}: StartServeResourcesOptions): Promise<ServeResources> {
    let broker: AuthBrokerServerHandle | undefined;
    let server: Bun.Server<undefined> | undefined;
    try {
        broker = startBroker(storage);
        server = await startPublicServer({
            allowedHostname,
            context: createControlContext(store, storage, broker),
            port,
        });
        return { broker, server };
    } catch (error) {
        await closeResources(server, broker, storage);
        throw error;
    }
}

function createClose(resources: ServeResources, storage: AuthStorage): () => Promise<void> {
    let closePromise: Promise<void> | undefined;
    return () => (closePromise ??= closeResources(resources.server, resources.broker, storage));
}

async function watchForShutdown(close: () => Promise<void>): Promise<never> {
    let stopping = false;
    const shutdown = async (): Promise<void> => {
        if (stopping) {
            return;
        }
        stopping = true;

        try {
            await close();
        } finally {
            process.exit(0);
        }
    };

    process.once("SIGINT", () => {
        void shutdown();
    });
    process.once("SIGTERM", () => {
        void shutdown();
    });

    return await new Promise<never>(() => {});
}

// `authStorageOptions` is not part of `BrokerSettings` and is never read from `--settings=<path>`.
// It exists so embedders (e.g. the e2e screenshot suite) can seed `AuthStorage` hooks like `fetchUsageReports`.
export async function startServe(
    settings: BrokerSettings,
    authStorageOptions?: AuthStorageOptions,
): Promise<ServeHandle> {
    const { store, storage } = await openAuthStorage(authStorageOptions);
    const resources = await startServeResources({
        allowedHostname: settings.hostname,
        port: settings.port,
        storage,
        store,
    });
    const url = `http://${LOOPBACK_HOSTNAME}:${resources.server.port}`;
    logger.info("omp-auth-broker listening", {
        auth: "none (network-gated)",
        ui: "/",
        url,
    });
    return { url, close: createClose(resources, storage) };
}

export async function runServe(flags: ServeFlags): Promise<never> {
    const settings = await loadSettings(flags.settings);
    setLogFormat(settings.logJson ? "json" : "pretty");
    const serve = await startServe(settings);
    return await watchForShutdown(serve.close);
}

function withHostCheck<RequestType extends Request, ResponseType>(
    handler: (request: RequestType) => ResponseType,
    allowedHostname?: string,
): (request: RequestType) => Response | ResponseType {
    return (request) => rejectDisallowedHost(request, allowedHostname) ?? handler(request);
}

function withRequestLogging<RequestType extends Request>(
    handler: (request: RequestType) => Response | Promise<Response>,
): (request: RequestType) => Promise<Response> {
    return async (request) => {
        const startedAt = performance.now();
        const { pathname } = new URL(request.url);
        try {
            const response = await handler(request);
            logIncomingRequest({ method: request.method, path: pathname, startedAt, status: response.status });
            return response;
        } catch (error) {
            logIncomingRequest({ error, method: request.method, path: pathname, startedAt });
            throw error;
        }
    };
}

function dispatch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, 404);
    }

    return new Response("Not Found", { status: 404 });
}
