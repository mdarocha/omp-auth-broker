import "./app.css";
import { h, render } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import htm from "htm";
import { Accounts } from "./components/Accounts";
import { LoginFlow } from "./components/LoginFlow";
import { ProviderPicker } from "./components/ProviderPicker";
import { Usage } from "./components/Usage";

const html = htm.bind(h);

export type Provider = { id: string; name: string; pasteCode: boolean };
export type Credential = {
    id: number;
    provider: string;
    identityKey?: string | null;
    credential: {
        type: string;
        expires?: number;
        email?: string;
        accountId?: string;
        orgName?: string;
        disabled?: boolean;
    };
    disabled?: boolean;
    rotatesInMs: number | null;
};
export type Snapshot = { credentials: Credential[]; generatedAt?: number };
export type UsageAmount = {
    used?: number;
    limit?: number;
    remaining?: number;
    usedFraction?: number;
    remainingFraction?: number;
    unit: string;
};
export type UsageLimit = {
    id: string;
    label: string;
    amount: UsageAmount;
    status?: string;
    window?: { label?: string; resetsAt?: number; resetLabel?: string };
};
export type UsageReport = {
    provider: string;
    fetchedAt: number;
    limits: UsageLimit[];
    metadata?: Record<string, unknown>;
};
export type ClientProviderUsage = {
    provider: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
};
export type ClientUsage = {
    installId: string;
    hostname?: string;
    firstSeen: number;
    lastSeen: number;
    providers: ClientProviderUsage[];
};
export type Usage = { reports: UsageReport[]; clients: ClientUsage[]; generatedAt?: number };
export type LoginSession = {
    sessionId: string;
    provider: Provider;
    url: string;
    instructions?: string;
    needsCode: boolean;
    state: "pending" | "done" | "error";
    message?: string;
};
export type AsyncState<T> = { phase: "loading" } | { phase: "ready"; data: T } | { phase: "error"; message: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("content-type", "application/json");
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
        let detail = "";
        try {
            const body = await response.json();
            detail = body.error ?? body.message ?? "";
        } catch {
            detail = await response.text().catch(() => "");
        }
        throw new Error(detail || `${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function App() {
    const [snapshot, setSnapshot] = useState<AsyncState<Snapshot>>({ phase: "loading" });
    const [usage, setUsage] = useState<AsyncState<Usage>>({ phase: "loading" });
    const [providers, setProviders] = useState<AsyncState<Provider[]>>({ phase: "loading" });
    const [pickerOpen, setPickerOpen] = useState(false);
    const [loginBusy, setLoginBusy] = useState<string | null>(null);
    const [login, setLogin] = useState<LoginSession | null>(null);
    const [code, setCode] = useState("");
    const [codeBusy, setCodeBusy] = useState(false);
    const [codeError, setCodeError] = useState<string | null>(null);
    const [removing, setRemoving] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);

    const loadSnapshot = useCallback(async () => {
        try {
            setSnapshot({ phase: "ready", data: await api<Snapshot>("/api/snapshot") });
        } catch (error) {
            setSnapshot({ phase: "error", message: errorMessage(error) });
        }
    }, []);

    const loadUsage = useCallback(async () => {
        try {
            setUsage({ phase: "ready", data: await api<Usage>("/api/usage") });
        } catch (error) {
            setUsage({ phase: "error", message: errorMessage(error) });
        }
    }, []);

    const loadProviders = useCallback(async () => {
        try {
            setProviders({ phase: "ready", data: await api<Provider[]>("/api/providers") });
        } catch (error) {
            setProviders({ phase: "error", message: errorMessage(error) });
        }
    }, []);

    useEffect(() => {
        void loadSnapshot();
        void loadUsage();
        void loadProviders();
    }, [loadProviders, loadSnapshot, loadUsage]);

    useEffect(() => {
        if (login?.state !== "pending") return;
        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const status = await api<{ state: "pending" | "done" | "error"; message?: string; needsCode: boolean }>(
                    `/api/login/${encodeURIComponent(login.sessionId)}/status`,
                );
                if (cancelled) return;
                setLogin((current) => (current ? { ...current, ...status } : current));
                if (status.state === "done") {
                    void loadSnapshot();
                    void loadUsage();
                    return;
                }
                if (status.state === "pending") timeout = setTimeout(poll, 1_500);
            } catch (error) {
                if (!cancelled)
                    setLogin((current) =>
                        current ? { ...current, state: "error", message: errorMessage(error) } : current,
                    );
            }
        };
        timeout = setTimeout(poll, 1_500);
        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [login?.sessionId, login?.state, loadSnapshot, loadUsage]);

    async function startLogin(provider: Provider) {
        setLoginBusy(provider.id);
        setLogin(null);
        setCode("");
        setCodeError(null);
        try {
            const started = await api<{ sessionId: string; url: string; instructions?: string; needsCode: boolean }>(
                "/api/login",
                {
                    method: "POST",
                    body: JSON.stringify({ provider: provider.id }),
                },
            );
            setLogin({ ...started, provider, state: "pending" });
            setPickerOpen(false);
        } catch (error) {
            setLogin({
                sessionId: "",
                provider,
                url: "",
                needsCode: false,
                state: "error",
                message: errorMessage(error),
            });
        } finally {
            setLoginBusy(null);
        }
    }

    async function submitCode(event: Event) {
        event.preventDefault();
        if (!login || !code.trim()) return;
        setCodeBusy(true);
        setCodeError(null);
        try {
            await api(`/api/login/${encodeURIComponent(login.sessionId)}/code`, {
                method: "POST",
                body: JSON.stringify({ code: code.trim() }),
            });
            setCode("");
        } catch (error) {
            setCodeError(errorMessage(error));
        } finally {
            setCodeBusy(false);
        }
    }

    async function removeProvider(provider: string) {
        if (!window.confirm(`Remove all ${provider} credentials from the shared vault?`)) return;
        setRemoving(provider);
        setRemoveError(null);
        try {
            await api("/api/logout", { method: "POST", body: JSON.stringify({ provider }) });
            await Promise.all([loadSnapshot(), loadUsage()]);
        } catch (error) {
            setRemoveError(errorMessage(error));
        } finally {
            setRemoving(null);
        }
    }

    const reportRows = useMemo(
        () =>
            usage.phase === "ready"
                ? usage.data.reports.flatMap((report) => report.limits.map((limit) => ({ report, limit })))
                : [],
        [usage],
    );

    return html`
        <div class="shell">
            <header class="masthead">
                <div>
                    <p class="eyebrow">Shared credential plane</p>
                    <h1>auth<span aria-hidden="true">/</span>broker</h1>
                </div>
                <div class="connection" aria-label="Connection security">
                    <span class="connection__mark" aria-hidden="true"></span>
                    <span>Network gated</span>
                </div>
            </header>

            <main>
                <section class="section" aria-labelledby="accounts-heading">
                    <div class="section__head">
                        <div>
                            <p class="section__index">01 / Vault</p>
                            <h2 id="accounts-heading">Accounts</h2>
                        </div>
                        <button
                            class="button button--primary"
                            type="button"
                            aria-expanded=${pickerOpen}
                            aria-controls="provider-picker"
                            onClick=${() => setPickerOpen((value) => !value)}
                        >
                            ${pickerOpen ? "Close" : "Add provider"}
                        </button>
                    </div>

                    ${pickerOpen && html`<${ProviderPicker} providers=${providers} loginBusy=${loginBusy} onRetry=${loadProviders} onSelect=${startLogin} />`}
                    ${login && html`<${LoginFlow} login=${login} code=${code} codeBusy=${codeBusy} codeError=${codeError} onCodeChange=${setCode} onSubmitCode=${submitCode} onDismiss=${() => setLogin(null)} />`}
                    <${Accounts}
                        snapshot=${snapshot}
                        removing=${removing}
                        removeError=${removeError}
                        onRetry=${loadSnapshot}
                        onChooseProvider=${() => setPickerOpen(true)}
                        onRemoveProvider=${removeProvider}
                    />
                </section>

                <${Usage} usage=${usage} reportRows=${reportRows} onRetry=${loadUsage} />
            </main>
            <footer><span>omp auth broker</span><span>Shared vault · No application authentication</span></footer>
        </div>
    `;
}

render(html`<${App} />`, document.getElementById("app")!);
