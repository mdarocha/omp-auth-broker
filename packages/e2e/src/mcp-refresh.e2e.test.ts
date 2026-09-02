import { credentialRefreshSchema, snapshotSchema } from "./schemas";
import { expect, test } from "bun:test";
import { seedVaultCredential, startMockMcpTokenServer } from "../../broker/src/testing/mock-mcp-server";
import { assertLoopbackHttpUrl } from "./loopback";
import ky from "ky";
import { startTestApp } from "./fixture";
import type { TestApp } from "./fixture";

const MCP_SERVER_URL = "https://example.invalid/mcp";
const MCP_PROVIDER_ID = `mcp_oauth:profile:default:${MCP_SERVER_URL}`;
const STALE_REFRESH_TOKEN = "stale-mcp-refresh-token";
const TEST_CLIENT_ID = "mcp-test-client-id";

test.serial(
    "refreshes broker-backed MCP OAuth credentials via the generic refresh grant",
    async () => {
        const mockServer = startMockMcpTokenServer();
        let app: TestApp | undefined;

        try {
            app = await startTestApp({
                seed: async () => {
                    await seedVaultCredential(MCP_PROVIDER_ID, {
                        access: "stale-mcp-access-token",
                        clientId: TEST_CLIENT_ID,
                        expires: Date.now() + 60 * 60_000,
                        refresh: STALE_REFRESH_TOKEN,
                        tokenUrl: mockServer.tokenUrl,
                        type: "oauth",
                    });
                },
            });

            assertLoopbackHttpUrl(app.baseUrl);
            const client = ky.create({
                baseUrl: app.baseUrl,
                retry: 0,
                throwHttpErrors: false,
            });

            const snapshotResponse = await client.get("v1/snapshot");
            expect(snapshotResponse.status).toBe(200);
            const snapshot = snapshotSchema.parse(await snapshotResponse.json());

            const mcpEntry = snapshot.credentials.find(({ provider }) => provider === MCP_PROVIDER_ID);
            if (!mcpEntry) {
                throw new Error("Seeded MCP credential not found in broker snapshot");
            }
            const refreshResponse = await client.post(`v1/credential/${mcpEntry.id}/refresh`);
            expect(refreshResponse.status).toBe(200);
            const refresh = credentialRefreshSchema.parse(await refreshResponse.json());
            expect(refresh.entry.id).toBe(mcpEntry.id);
            expect(refresh.entry.provider).toBe(MCP_PROVIDER_ID);
            expect(refresh.entry.credential).toMatchObject({
                access: "fresh-mcp-access",
                type: "oauth",
            });

            const repeatedRefreshResponse = await client.post(`v1/credential/${mcpEntry.id}/refresh`);
            expect(repeatedRefreshResponse.status).toBe(200);
            expect(credentialRefreshSchema.parse(await repeatedRefreshResponse.json()).entry.credential).toMatchObject({
                access: "fresh-mcp-access",
                type: "oauth",
            });

            expect(mockServer.requests).toHaveLength(2);
            const [request, repeatedRequest] = mockServer.requests;
            expect(request.get("grant_type")).toBe("refresh_token");
            expect(request.get("refresh_token")).toBe(STALE_REFRESH_TOKEN);
            expect(request.get("client_id")).toBe(TEST_CLIENT_ID);
            expect(repeatedRequest.get("refresh_token")).toBe("rotated-mcp-refresh");
        } finally {
            try {
                await app?.close();
            } finally {
                mockServer.stop();
            }
        }
    },
    15_000,
);
