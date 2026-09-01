import { errorMessage, getLoginStatus, startLogin, submitLoginCode } from "../api/client";
import type { LoginSession, LoginStatusResult, Provider } from "../api/types";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useVault } from "./VaultContext";

const loginPollIntervalMs = 1_500;
const maxConsecutiveLoginPollFailures = 3;

interface LoginContextValue {
    login: LoginSession | null;
    code: string;
    codeBusy: boolean;
    codeError: string | null;
    beginLogin: (provider: Provider) => Promise<void>;
    onCodeChange: (code: string) => void;
    onSubmitCode: (event: Event) => Promise<void>;
    dismissLogin: () => void;
}
const LoginContext = createContext<LoginContextValue | null>(null);

type LoginUpdater = (updater: (current: LoginSession | null) => LoginSession | null) => void;

interface LoginStatusOptions {
    status: LoginStatusResult;
    updateLogin: LoginUpdater;
    refreshVault: () => void;
    scheduleNextPoll: () => void;
}

function applyLoginStatus({ status, updateLogin, refreshVault, scheduleNextPoll }: LoginStatusOptions): void {
    updateLogin((current) => (current ? { ...current, ...status } : current));
    if (status.state === "done") {
        refreshVault();
        return;
    }
    if (status.state === "pending") {
        scheduleNextPoll();
    }
}

interface LoginPollFailureOptions {
    error: unknown;
    consecutiveFailures: number;
    updateLogin: LoginUpdater;
    scheduleNextPoll: () => void;
}

function handleLoginPollFailure({
    error,
    consecutiveFailures,
    updateLogin,
    scheduleNextPoll,
}: LoginPollFailureOptions): void {
    if (consecutiveFailures < maxConsecutiveLoginPollFailures) {
        scheduleNextPoll();
        return;
    }
    updateLogin((current) => (current ? { ...current, state: "error", message: errorMessage(error) } : current));
}

function useLoginForm(login: LoginSession | null) {
    const [code, setCode] = useState("");
    const [codeBusy, setCodeBusy] = useState(false);
    const [codeError, setCodeError] = useState<string | null>(null);

    const onCodeChange = useCallback((newCode: string) => {
        setCode(newCode);
    }, []);

    const onSubmitCode = useCallback(
        async (event: Event) => {
            event.preventDefault();
            if (!login || !code.trim()) {
                return;
            }
            setCodeBusy(true);
            setCodeError(null);
            try {
                await submitLoginCode(login.sessionId, code.trim());
                setCode("");
            } catch (error) {
                setCodeError(errorMessage(error));
            } finally {
                setCodeBusy(false);
            }
        },
        [login, code],
    );

    const resetForm = useCallback(() => {
        setCode("");
        setCodeError(null);
    }, []);

    return { code, codeBusy, codeError, onCodeChange, onSubmitCode, resetForm };
}

export function LoginProvider({ children }: { children: ComponentChildren }) {
    const { refreshVault } = useVault();
    const [login, setLogin] = useState<LoginSession | null>(null);
    const { code, codeBusy, codeError, onCodeChange, onSubmitCode, resetForm } = useLoginForm(login);

    useEffect(() => {
        if (login?.state !== "pending") {
            return undefined;
        }
        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout>;
        let consecutiveFailures = 0;
        const updateLogin: LoginUpdater = (updater) => {
            setLogin(updater);
        };

        const poll = async () => {
            try {
                const status = await getLoginStatus(login.sessionId);
                consecutiveFailures = 0;
                if (cancelled) {
                    return;
                }
                applyLoginStatus({
                    status,
                    updateLogin,
                    refreshVault,
                    scheduleNextPoll: () => {
                        timeout = setTimeout(poll, loginPollIntervalMs);
                    },
                });
            } catch (error) {
                if (cancelled) {
                    return;
                }
                consecutiveFailures += 1;
                handleLoginPollFailure({
                    error,
                    consecutiveFailures,
                    updateLogin,
                    scheduleNextPoll: () => {
                        timeout = setTimeout(poll, loginPollIntervalMs);
                    },
                });
            }
        };

        timeout = setTimeout(poll, loginPollIntervalMs);
        return () => {
            cancelled = true;
            clearTimeout(timeout);
        };
    }, [login?.sessionId, login?.state, refreshVault]);

    const beginLogin = useCallback(
        async (provider: Provider) => {
            setLogin(null);
            resetForm();
            try {
                const started = await startLogin(provider.id);
                setLogin({ ...started, provider, state: "pending" });
            } catch (error) {
                setLogin({
                    sessionId: "",
                    provider,
                    url: "",
                    needsCode: false,
                    state: "error",
                    message: errorMessage(error),
                });
            }
        },
        [resetForm],
    );

    const dismissLogin = useCallback(() => {
        setLogin(null);
    }, []);

    const value = useMemo<LoginContextValue>(
        () => ({
            login,
            code,
            codeBusy,
            codeError,
            beginLogin,
            onCodeChange,
            onSubmitCode,
            dismissLogin,
        }),
        [login, code, codeBusy, codeError, beginLogin, onCodeChange, onSubmitCode, dismissLogin],
    );

    return <LoginContext.Provider value={value}>{children}</LoginContext.Provider>;
}

export function useLogin(): LoginContextValue {
    const context = useContext(LoginContext);
    if (!context) {
        throw new Error("useLogin must be used within a LoginProvider");
    }
    return context;
}
