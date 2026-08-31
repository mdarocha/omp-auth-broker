import type { Credential, LoginStartResult, LoginStatusResult, Provider, Snapshot, Usage } from "./types";

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

type TypeGuard<T> = (value: unknown) => value is T;

async function fetchJson<T>(path: string, guard: TypeGuard<T>, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    if (!response.ok) {
        const detail = await extractErrorDetail(response);
        throw new Error(detail || `${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!guard(data)) {
        throw new Error("Response shape did not match expected schema");
    }
    return data;
}

function isProvider(value: unknown): value is Provider {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.pasteCode === "boolean"
    );
}

function isProviderArray(value: unknown): value is Provider[] {
    return Array.isArray(value) && value.every(isProvider);
}

function isCredential(value: unknown): value is Credential {
    if (!isRecord(value) || !isRecord(value.credential)) {
        return false;
    }
    return (
        typeof value.id === "number" &&
        typeof value.provider === "string" &&
        typeof value.credential.type === "string" &&
        (value.rotatesInMs === null || typeof value.rotatesInMs === "number")
    );
}

function isSnapshot(value: unknown): value is Snapshot {
    return isRecord(value) && Array.isArray(value.credentials) && value.credentials.every(isCredential);
}

function isUsageAmount(value: unknown): boolean {
    return isRecord(value) && typeof value.unit === "string";
}

function isUsageLimit(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.label === "string" &&
        isUsageAmount(value.amount)
    );
}

function isUsageReport(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.provider === "string" &&
        typeof value.fetchedAt === "number" &&
        Array.isArray(value.limits) &&
        value.limits.every(isUsageLimit)
    );
}

function isClientProviderUsage(value: unknown): boolean {
    return isRecord(value) && typeof value.provider === "string" && typeof value.requests === "number";
}

function isClientUsage(value: unknown): boolean {
    return (
        isRecord(value) &&
        typeof value.installId === "string" &&
        typeof value.firstSeen === "number" &&
        typeof value.lastSeen === "number" &&
        Array.isArray(value.providers) &&
        value.providers.every(isClientProviderUsage)
    );
}

function isUsage(value: unknown): value is Usage {
    return (
        isRecord(value) &&
        Array.isArray(value.reports) &&
        value.reports.every(isUsageReport) &&
        Array.isArray(value.clients) &&
        value.clients.every(isClientUsage)
    );
}

function isLoginStartResult(value: unknown): value is LoginStartResult {
    return (
        isRecord(value) &&
        typeof value.sessionId === "string" &&
        typeof value.url === "string" &&
        typeof value.needsCode === "boolean"
    );
}

function isLoginStatusResult(value: unknown): value is LoginStatusResult {
    if (!isRecord(value)) {
        return false;
    }
    const state = value.state;
    return (state === "pending" || state === "done" || state === "error") && typeof value.needsCode === "boolean";
}

export async function getProviders(): Promise<Provider[]> {
    return fetchJson("/api/providers", isProviderArray);
}

export async function getSnapshot(): Promise<Snapshot> {
    return fetchJson("/api/snapshot", isSnapshot);
}

export async function getUsage(): Promise<Usage> {
    return fetchJson("/api/usage", isUsage);
}

export async function startLogin(providerId: string): Promise<LoginStartResult> {
    return fetchJson("/api/login", isLoginStartResult, {
        method: "POST",
        body: JSON.stringify({ provider: providerId }),
        headers: { "content-type": "application/json" },
    });
}

export async function getLoginStatus(sessionId: string): Promise<LoginStatusResult> {
    return fetchJson(`/api/login/${encodeURIComponent(sessionId)}/status`, isLoginStatusResult);
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
