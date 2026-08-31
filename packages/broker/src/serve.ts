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

interface BindOptions {
    hostname: string;
    port: number;
}

interface AuthState {
    store: SqliteAuthCredentialStore;
    storage: AuthStorage;
}

interface PublicServerOptions {
    broker: AuthBrokerServerHandle;
    context: ControlContext;
    options: BindOptions;
    storage: AuthStorage;
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

async function startPublicServer({
    broker,
    context,
    options,
    storage,
}: PublicServerOptions): Promise<Bun.Server<undefined>> {
    try {
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
    } catch (error) {
        await broker.close();
        await Promise.resolve(storage.close());
        throw error;
    }
}

async function watchForShutdown(
    server: Bun.Server<undefined>,
    broker: AuthBrokerServerHandle,
    storage: AuthStorage,
): Promise<never> {
    let stopping = false;
    const shutdown = async (): Promise<void> => {
        if (stopping) {
            return;
        }
        stopping = true;

        try {
            await server.stop(true);
            await broker.close();
            await Promise.resolve(storage.close());
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

export async function runServe(flags: ServeFlags): Promise<never> {
    setTransports({ console: true, file: false });

    const publicBind = flags.bind ?? DEFAULT_AUTH_BROKER_BIND;
    const publicOptions = parseBindToServeOptions(publicBind);
    const { store, storage } = await openAuthStorage();

    const broker = startAuthBroker({
        storage,
        bind: "127.0.0.1:0",
        bearerTokens: [],
        version: VERSION,
    });
    const context: ControlContext = {
        brokerBase: `http://127.0.0.1:${broker.port}`,
        sessions: new Map(),
        storage,
        store,
    };

    const server = await startPublicServer({ broker, context, options: publicOptions, storage });

    const url = `http://${formatHost(publicOptions.hostname)}:${server.port}`;
    logger.info("omp-auth-broker listening", {
        auth: "none (network-gated)",
        ui: "/",
        url,
    });

    return await watchForShutdown(server, broker, storage);
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
