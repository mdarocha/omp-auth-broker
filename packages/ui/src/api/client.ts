import type { LoginStartResult, LoginStatusResult, Provider, Snapshot, Usage } from "./types";
import { loginStartResultSchema, loginStatusResultSchema, providersSchema, snapshotSchema, usageSchema } from "./types";
import type { z } from "zod";

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function readJsonErrorDetail(response: Response): Promise<string | undefined> {
    try {
        const body: unknown = await response.json();
        if (!isRecord(body)) {
            return undefined;
        }
        const detail = body.error ?? body.message;
        return typeof detail === "string" ? detail : undefined;
    } catch {
        return undefined;
    }
}

async function readTextErrorDetail(response: Response): Promise<string | undefined> {
    try {
        const text = await response.text();
        return text || undefined;
    } catch {
        return undefined;
    }
}

async function extractErrorDetail(response: Response): Promise<string> {
    const jsonDetail = await readJsonErrorDetail(response);
    if (jsonDetail) {
        return jsonDetail;
    }
    const textDetail = await readTextErrorDetail(response);
    return textDetail || `${response.status} ${response.statusText}`;
}

type ResponseSchema<T> = z.ZodType<T>;

async function fetchJson<T>(path: string, schema: ResponseSchema<T>, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    if (!response.ok) {
        const detail = await extractErrorDetail(response);
        throw new Error(detail || `${response.status} ${response.statusText}`);
    }
    const data: unknown = await response.json();
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new Error("Response shape did not match expected schema");
    }
    return result.data;
}

export async function getProviders(): Promise<Provider[]> {
    return fetchJson("/api/providers", providersSchema);
}

export async function getSnapshot(): Promise<Snapshot> {
    return fetchJson("/api/snapshot", snapshotSchema);
}

export async function getUsage(): Promise<Usage> {
    return fetchJson("/api/usage", usageSchema);
}

export async function startLogin(providerId: string): Promise<LoginStartResult> {
    return fetchJson("/api/login", loginStartResultSchema, {
        method: "POST",
        body: JSON.stringify({ provider: providerId }),
        headers: { "content-type": "application/json" },
    });
}

export async function getLoginStatus(sessionId: string): Promise<LoginStatusResult> {
    return fetchJson(`/api/login/${encodeURIComponent(sessionId)}/status`, loginStatusResultSchema);
}

export async function submitLoginCode(sessionId: string, code: string): Promise<void> {
    const response = await fetch(`/api/login/${encodeURIComponent(sessionId)}/code`, {
        method: "POST",
        body: JSON.stringify({ code }),
        headers: { "content-type": "application/json" },
    });
    if (!response.ok) {
        const detail = await extractErrorDetail(response);
        throw new Error(detail);
    }
}

export async function logout(providerId: string): Promise<void> {
    const response = await fetch("/api/logout", {
        method: "POST",
        body: JSON.stringify({ provider: providerId }),
        headers: { "content-type": "application/json" },
    });
    if (!response.ok) {
        const detail = await extractErrorDetail(response);
        throw new Error(detail);
    }
}
