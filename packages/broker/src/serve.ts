import {
  AuthStorage,
  SqliteAuthCredentialStore,
  type OAuthProvider,
} from "@oh-my-pi/pi-ai";
import {
  DEFAULT_AUTH_BROKER_BIND,
  startAuthBroker,
} from "@oh-my-pi/pi-ai/auth-broker";
import { refreshOAuthToken } from "@oh-my-pi/pi-ai/oauth";
import {
  getAgentDbPath,
  logger,
  VERSION,
} from "@oh-my-pi/pi-utils";
import { setTransports } from "@oh-my-pi/pi-utils/logger";
import uiIndex from "../../ui/index.html";
import { controlApi, type ControlContext } from "./control";

export interface ServeFlags {
  bind?: string;
}

interface BindOptions {
  hostname: string;
  port: number;
}

export async function runServe(flags: ServeFlags): Promise<never> {
  setTransports({ console: true, file: false });

  const publicBind = flags.bind ?? DEFAULT_AUTH_BROKER_BIND;
  const publicOptions = parseBindToServeOptions(publicBind);
  const store = await SqliteAuthCredentialStore.open(getAgentDbPath());
  const storage = new AuthStorage(store, {
    refreshOAuthCredential: (provider, _id, credential) =>
      refreshOAuthToken(provider as OAuthProvider, credential),
  });

  try {
    await storage.reload();
  } catch (error) {
    await Promise.resolve(storage.close());
    throw error;
  }

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

  let server: Bun.Server<undefined>;
  try {
    server = Bun.serve({
      ...publicOptions,
      idleTimeout: 255,
      routes: {
        "/": uiIndex,
      },
      fetch(request) {
        return dispatch(request, context);
      },
    });
  } catch (error) {
    broker.close();
    await Promise.resolve(storage.close());
    throw error;
  }

  const url = `http://${formatHost(publicOptions.hostname)}:${server.port}`;
  logger.info("omp-auth-broker listening", {
    auth: "none (network-gated)",
    ui: "/",
    url,
  });

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;

    try {
      server.stop(true);
      broker.close();
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

export async function proxyToBroker(
  request: Request,
  brokerBase: string,
): Promise<Response> {
  const url = new URL(request.url);
  const response = await fetch(`${brokerBase}${url.pathname}${url.search}`, {
    body: request.body,
    duplex: "half",
    headers: request.headers,
    method: request.method,
  } as RequestInit & { duplex: "half" });

  return new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
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

async function dispatch(
  request: Request,
  context: ControlContext,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/v1" || pathname.startsWith("/v1/")) {
    return proxyToBroker(request, context.brokerBase);
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return controlApi(request, context);
  }

  return new Response("Not Found", { status: 404 });
}
