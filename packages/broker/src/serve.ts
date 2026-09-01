import { AuthStorage, SqliteAuthCredentialStore } from "@oh-my-pi/pi-ai";
import { DEFAULT_AUTH_BROKER_BIND, startAuthBroker } from "@oh-my-pi/pi-ai/auth-broker";
import { getAgentDbPath, logger, VERSION } from "@oh-my-pi/pi-utils";
import type { AuthBrokerServerHandle } from "@oh-my-pi/pi-ai/auth-broker";
import { setTransports } from "@oh-my-pi/pi-utils/logger";

import { buildControlRoutes } from "./routes";
import type { ControlContext } from "./control";
import { json } from "./http";
import { proxyToBroker } from "./proxy";
import uiIndex from "../../ui/index.html";

export interface ServeFlags {
    bind?: string;
}

export interface ServeHandle {
    url: string;
    close: () => Promise<void>;
}

interface BindOptions {
    hostname: string;
    port: number;
}

interface AuthState {
    store: SqliteAuthCredentialStore;
    storage: AuthStorage;
}

interface PublicServerOptions {
    context: ControlContext;
    options: BindOptions;
}

interface CleanupState {
    failure: unknown;
    hasFailure: boolean;
}

interface ServeResources {
    broker: AuthBrokerServerHandle;
    server: Bun.Server<undefined>;
}

async function openAuthStorage(): Promise<AuthState> {
    const store = await SqliteAuthCredentialStore.open(getAgentDbPath());
    const storage = new AuthStorage(store);
    try {
        await storage.reload();
    } catch (error) {
        await Promise.resolve(storage.close());
        throw error;
    }
    return { store, storage };
}

async function startPublicServer({ context, options }: PublicServerOptions): Promise<Bun.Server<undefined>> {
    return Bun.serve({
        ...options,
        idleTimeout: 255,
        routes: {
            "/": uiIndex,
            ...buildControlRoutes(context),
            "/v1": (request: Request) => proxyToBroker(request, context.brokerBase),
            "/v1/*": (request: Request) => proxyToBroker(request, context.brokerBase),
        },
        fetch(request) {
            return dispatch(request);
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
    return startAuthBroker({
        storage,
        bind: "127.0.0.1:0",
        bearerTokens: [],
        version: VERSION,
    });
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

async function startServeResources(
    store: SqliteAuthCredentialStore,
    storage: AuthStorage,
    publicOptions: BindOptions,
): Promise<ServeResources> {
    let broker: AuthBrokerServerHandle | undefined;
    let server: Bun.Server<undefined> | undefined;
    try {
        broker = startBroker(storage);
        server = await startPublicServer({
            context: createControlContext(store, storage, broker),
            options: publicOptions,
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

export async function startServe(flags: ServeFlags): Promise<ServeHandle> {
    const publicOptions = parseBindToServeOptions(flags.bind ?? DEFAULT_AUTH_BROKER_BIND);
    const { store, storage } = await openAuthStorage();
    const resources = await startServeResources(store, storage, publicOptions);
    const url = `http://${formatHost(publicOptions.hostname)}:${resources.server.port}`;
    logger.info("omp-auth-broker listening", {
        auth: "none (network-gated)",
        ui: "/",
        url,
    });
    return { url, close: createClose(resources, storage) };
}

export async function runServe(flags: ServeFlags): Promise<never> {
    setTransports({ console: true, file: false });
    const serve = await startServe(flags);
    return await watchForShutdown(serve.close);
}

function parseBindToServeOptions(bind: string): BindOptions {
    const bracketedMatch = /^\[([^\]]+)\]:(\d+)$/.exec(bind);
    const unbracketedMatch = /^([^:\s]+):(\d+)$/.exec(bind);
    const match = bracketedMatch ?? unbracketedMatch;
    if (!match) {
        throw new Error(`Invalid bind address ${JSON.stringify(bind)}; expected host:port`);
    }

    const [, hostname, portString] = match;
    const port = Number(portString);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
        throw new Error(`Invalid bind port ${JSON.stringify(portString)}`);
    }

    return { hostname, port };
}

function formatHost(hostname: string): string {
    return hostname.includes(":") ? `[${hostname}]` : hostname;
}

function dispatch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, 404);
    }

    return new Response("Not Found", { status: 404 });
}
