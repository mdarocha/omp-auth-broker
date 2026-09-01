import { readFile } from "node:fs/promises";

import { isRecord } from "./http";

export const DEFAULT_PORT = 8765;

export interface BrokerSettings {
    port: number;
    hostname?: string;
}

export async function loadSettings(path?: string): Promise<BrokerSettings> {
    if (path === undefined) {
        return { port: DEFAULT_PORT };
    }

    return validateSettings(await readSettingsFile(path));
}

async function readSettingsFile(path: string): Promise<Record<string, unknown>> {
    let value: unknown;
    try {
        value = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid settings file ${JSON.stringify(path)}: malformed JSON`, { cause: error });
        }
        throw error;
    }

    if (!isRecord(value) || Array.isArray(value)) {
        throw new Error(`Invalid settings file ${JSON.stringify(path)}: expected a JSON object`);
    }
    return value;
}

function validateSettings(value: Record<string, unknown>): BrokerSettings {
    const port = validatePort(value.port);
    const hostname = validateHostname(value.hostname);
    return hostname === undefined ? { port } : { port, hostname };
}

function validatePort(port: unknown): number {
    const portNumber = port === undefined ? DEFAULT_PORT : port;
    if (typeof portNumber !== "number" || !Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65_535) {
        throw new Error('Invalid settings key "port": expected an integer from 0 to 65535');
    }
    return portNumber;
}

function validateHostname(hostname: unknown): string | undefined {
    if (hostname !== undefined && typeof hostname !== "string") {
        throw new Error('Invalid settings key "hostname": expected a string');
    }
    return hostname;
}
