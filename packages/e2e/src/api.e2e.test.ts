import { afterAll, expect, test } from "bun:test";
import { assertLoopbackHttpUrl } from "./loopback";
import ky from "ky";
import type { KyInstance } from "ky";
import { startTestApp } from "./fixture";
import type { z } from "zod";

import {
    apiUsageSchema,
    clientUsageSummarySchema,
    credentialRefreshSchema,
    healthzSchema,
    loginStartSchema,
    loginStatusSchema,
    okSchema,
    providersSchema,
    snapshotSchema,
    usageSchema,
} from "./schemas";

const mockProviderId = "mock-provider";
const loginPollAttempts = 100;
const loginPollIntervalMs = 50;

let activeApp: Awaited<ReturnType<typeof startTestApp>> | undefined;

afterAll(async () => {
    await activeApp?.close();
});

async function requestJson<T>(request: Promise<Response>, schema: z.ZodType<T>): Promise<T> {
    const response = await request;
    expect(response.status).toBe(200);
    return schema.parse(await response.json());
}

async function waitForLogin(client: KyInstance, sessionId: string): Promise<z.infer<typeof loginStatusSchema>> {
    for (let attempt = 0; attempt < loginPollAttempts; attempt += 1) {
        const status = await requestJson(client.get(`api/login/${sessionId}/status`), loginStatusSchema);
        if (status.state === "done") {
            return status;
        }
        if (status.state === "error") {
            throw new Error(status.message ?? "Mock provider login failed");
        }
        await Bun.sleep(loginPollIntervalMs);
    }
    throw new Error("Mock provider login did not complete within five seconds");
}

test.serial(
    "serves the mock provider credential lifecycle over loopback APIs",
    async () => {
        const app = await startTestApp();
        activeApp = app;
        try {
            assertLoopbackHttpUrl(app.baseUrl);
            assertLoopbackHttpUrl(app.mockProvider.url);
            const client = ky.create({
                baseUrl: app.baseUrl,
                retry: 0,
                throwHttpErrors: false,
            });

            const health = await requestJson(client.get("v1/healthz"), healthzSchema);
            expect(health.ok).toBe(true);

            const initialSnapshot = await requestJson(client.get("v1/snapshot"), snapshotSchema);
            expect(initialSnapshot.credentials).toEqual([]);

            await requestJson(client.get("v1/usage"), usageSchema);
            await requestJson(client.get("v1/usage/clients?sinceMs=0"), clientUsageSummarySchema);

            const providers = await requestJson(client.get("api/providers"), providersSchema);
            expect(providers).toContainEqual({
                id: mockProviderId,
                name: "Mock Provider",
                pasteCode: false,
            });

            await requestJson(client.get("api/usage"), apiUsageSchema);

            const login = await requestJson(
                client.post("api/login", { json: { provider: mockProviderId } }),
                loginStartSchema,
            );
            expect(login.needsCode).toBe(false);
            assertLoopbackHttpUrl(login.url);

            const loginStatus = await waitForLogin(client, login.sessionId);
            expect(loginStatus.needsCode).toBe(false);
            expect(loginStatus.state).toBe("done");

            const persistedSnapshot = await requestJson(client.get("v1/snapshot"), snapshotSchema);
            const mockCredential = persistedSnapshot.credentials.find(({ provider }) => provider === mockProviderId);
            if (!mockCredential) {
                throw new Error("Mock provider credential was not persisted");
            }
            expect(mockCredential.identityKey).toBe("email:mock-user@localhost");
            expect(mockCredential.credential).toMatchObject({ type: "oauth" });
            expect(app.mockProvider.issuedTokens).toHaveLength(1);
            const initialTokens = app.mockProvider.issuedTokens[0];

            const refresh = await requestJson(
                client.post(`v1/credential/${mockCredential.id}/refresh`),
                credentialRefreshSchema,
            );
            expect(refresh.entry.id).toBe(mockCredential.id);
            expect(refresh.entry.provider).toBe(mockProviderId);
            expect(app.mockProvider.refreshCount).toBe(1);
            expect(app.mockProvider.issuedTokens).toHaveLength(2);
            const refreshedTokens = app.mockProvider.issuedTokens[1];
            expect(refreshedTokens).not.toEqual(initialTokens);
            expect(refresh.entry.credential).toMatchObject({
                access: refreshedTokens.accessToken,
                type: "oauth",
            });

            const logout = await requestJson(
                client.post("api/logout", { json: { provider: mockProviderId } }),
                okSchema,
            );
            expect(logout.ok).toBe(true);

            const finalSnapshot = await requestJson(client.get("v1/snapshot"), snapshotSchema);
            expect(finalSnapshot.credentials.some(({ provider }) => provider === mockProviderId)).toBe(false);
        } finally {
            await app.close();
            if (activeApp === app) {
                activeApp = undefined;
            }
        }
    },
    15_000,
);
