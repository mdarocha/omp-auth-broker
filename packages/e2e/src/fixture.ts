import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { MockProviderServer } from "../../broker/src/testing/mock-provider-server";
import { refreshDirsFromEnv } from "@oh-my-pi/pi-utils";
import { registerMockProvider } from "../../broker/src/testing/mock-provider";
import type { ServeHandle } from "../../broker/src/serve";
import { startMockProviderServer } from "../../broker/src/testing/mock-provider-server";
import { startServe } from "../../broker/src/serve";
import { tmpdir } from "node:os";

export interface TestApp {
    baseUrl: string;
    mockProvider: MockProviderServer;
    close: () => Promise<void>;
}

interface IsolatedTestEnvironment {
    configDir: string;
    restore: () => void;
}

interface TestAppResources extends IsolatedTestEnvironment {
    mockProvider?: MockProviderServer;
    serve?: ServeHandle;
    unregister?: () => void;
}

function restoreConfigDir(previousConfigDir: string | undefined): void {
    if (previousConfigDir === undefined) {
        delete process.env.PI_CONFIG_DIR;
    } else {
        process.env.PI_CONFIG_DIR = previousConfigDir;
    }
    refreshDirsFromEnv();
}

async function isolateTestEnvironment(): Promise<IsolatedTestEnvironment> {
    const previousConfigDir = process.env.PI_CONFIG_DIR;
    const configDir = await mkdtemp(join(tmpdir(), "omp-auth-broker-e2e-"));
    process.env.PI_CONFIG_DIR = configDir;
    refreshDirsFromEnv();
    return { configDir, restore: () => restoreConfigDir(previousConfigDir) };
}

function setupMockProvider(resources: TestAppResources): MockProviderServer {
    const mockProvider = startMockProviderServer();
    resources.mockProvider = mockProvider;
    resources.unregister = registerMockProvider({ serverUrl: mockProvider.url }).unregister;
    return mockProvider;
}

async function cleanupTestAppResources(resources: TestAppResources): Promise<void> {
    try {
        await resources.serve?.close();
    } finally {
        try {
            resources.unregister?.();
        } finally {
            try {
                resources.mockProvider?.stop();
            } finally {
                try {
                    await rm(resources.configDir, { force: true, recursive: true });
                } finally {
                    resources.restore();
                }
            }
        }
    }
}

function createClose(resources: TestAppResources): () => Promise<void> {
    let closePromise: Promise<void> | undefined;
    return () => (closePromise ??= cleanupTestAppResources(resources));
}

export interface StartTestAppOptions {
    seed?: () => Promise<void>;
}

export async function startTestApp(options?: StartTestAppOptions): Promise<TestApp> {
    const resources: TestAppResources = await isolateTestEnvironment();
    const close = createClose(resources);
    try {
        const mockProvider = setupMockProvider(resources);
        if (options?.seed) {
            await options.seed();
        }
        resources.serve = await startServe({ port: 0 });
        return { baseUrl: resources.serve.url, close, mockProvider };
    } catch (error) {
        await close();
        throw error;
    }
}
