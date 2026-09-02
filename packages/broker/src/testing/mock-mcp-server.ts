import { AuthStorage, SqliteAuthCredentialStore } from "@oh-my-pi/pi-ai";
import { getAgentDbPath } from "@oh-my-pi/pi-utils";
import type { McpStoredOAuthCredential } from "../mcp-refresh";

const LOOPBACK_HOST = "127.0.0.1";
const HTTP_NOT_FOUND = 404;
const DEFAULT_ACCESS_TOKEN = "fresh-mcp-access";
const DEFAULT_REFRESH_TOKEN = "rotated-mcp-refresh";
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export interface MockMcpTokenServer {
    url: string;
    tokenUrl: string;
    requests: URLSearchParams[];
    stop: () => void;
}

export function startMockMcpTokenServer(): MockMcpTokenServer {
    const requests: URLSearchParams[] = [];

    const server = Bun.serve({
        hostname: LOOPBACK_HOST,
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            if (request.method === "POST" && url.pathname === "/token") {
                const params = new URLSearchParams(await request.text());
                requests.push(params);
                return Response.json({
                    access_token: DEFAULT_ACCESS_TOKEN,
                    refresh_token: DEFAULT_REFRESH_TOKEN,
                    expires_in: DEFAULT_EXPIRES_IN_SECONDS,
                });
            }
            return Response.json({ error: "not_found" }, { status: HTTP_NOT_FOUND });
        },
    });

    const port = server.port;
    if (typeof port !== "number") {
        void server.stop(true);
        throw new Error("Mock MCP token server failed to bind a TCP port");
    }

    return {
        url: `http://${LOOPBACK_HOST}:${port}`,
        tokenUrl: `http://${LOOPBACK_HOST}:${port}/token`,
        requests,
        stop: () => server.stop(true),
    };
}

export async function seedVaultCredential(provider: string, credential: McpStoredOAuthCredential): Promise<void> {
    // GetAgentDbPath() resolves through PI_CONFIG_DIR.
    // Requiring it here ensures this only touches the isolated temp vault the e2e fixture sets up.
    if (!process.env.PI_CONFIG_DIR) {
        throw new Error("seedVaultCredential must only run with PI_CONFIG_DIR set to an isolated test vault");
    }
    const store = await SqliteAuthCredentialStore.open(getAgentDbPath());
    const storage = new AuthStorage(store);
    try {
        await storage.reload();
        await storage.set(provider, credential);
    } finally {
        storage.close();
        store.close();
    }
}
