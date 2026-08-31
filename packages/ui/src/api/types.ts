export interface Provider {
    id: string;
    name: string;
    pasteCode: boolean;
}

export interface CredentialDetail {
    type: string;
    expires?: number;
    email?: string;
    accountId?: string;
    orgName?: string;
    disabled?: boolean;
}

export interface Credential {
    id: number;
    provider: string;
    identityKey?: string | null;
    credential: CredentialDetail;
    disabled?: boolean;
    rotatesInMs: number | null;
}

export interface Snapshot {
    credentials: Credential[];
    generatedAt?: number;
}

export interface UsageAmount {
    used?: number;
    limit?: number;
    remaining?: number;
    usedFraction?: number;
    remainingFraction?: number;
    unit: string;
}

export interface UsageWindow {
    label?: string;
    resetsAt?: number;
    resetLabel?: string;
}

export interface UsageLimit {
    id: string;
    label: string;
    amount: UsageAmount;
    status?: string;
    window?: UsageWindow;
}

export interface UsageReport {
    provider: string;
    fetchedAt: number;
    limits: UsageLimit[];
    metadata?: Record<string, unknown>;
}

export interface ClientProviderUsage {
    provider: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
}

export interface ClientUsage {
    installId: string;
    hostname?: string;
    firstSeen: number;
    lastSeen: number;
    providers: ClientProviderUsage[];
}

export interface Usage {
    reports: UsageReport[];
    clients: ClientUsage[];
    generatedAt?: number;
}

export type LoginState = "pending" | "done" | "error";

export interface LoginSession {
    sessionId: string;
    provider: Provider;
    url: string;
    instructions?: string;
    needsCode: boolean;
    state: LoginState;
    message?: string;
}

export interface LoginStartResult {
    sessionId: string;
    url: string;
    instructions?: string;
    needsCode: boolean;
}

export interface LoginStatusResult {
    state: LoginState;
    message?: string;
    needsCode: boolean;
}

export type AsyncState<T> = { phase: "loading" } | { phase: "ready"; data: T } | { phase: "error"; message: string };
