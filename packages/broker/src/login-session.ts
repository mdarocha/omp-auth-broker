import type { AuthStorage, OAuthProviderId } from "@oh-my-pi/pi-ai";
import { errorMessage } from "./http";
import { PASTE_CODE_LOGIN_PROVIDERS } from "@oh-my-pi/pi-ai";

const loginSessionTtlMs = 10 * 60 * 1000;

type LoginState = "pending" | "done" | "error";

export interface LoginSession {
    state: LoginState;
    needsCode: boolean;
    message?: string;
    url?: string;
    instructions?: string;
    inputPromise?: Promise<string>;
    resolveInput?: (code: string) => void;
    rejectInput?: (error: Error) => void;
}

export type LoginSessions = Map<string, LoginSession>;

export interface LoginStartResult {
    sessionId: string;
    url: string;
    instructions?: string;
    needsCode: boolean;
}

export function createLoginSession(sessions: LoginSessions): { sessionId: string; session: LoginSession } {
    const sessionId = crypto.randomUUID();
    const session: LoginSession = { needsCode: false, state: "pending" };
    sessions.set(sessionId, session);

    setTimeout(() => {
        const expiredSession = sessions.get(sessionId);
        if (expiredSession) {
            expiredSession.rejectInput?.(new Error("Login session expired"));
            sessions.delete(sessionId);
        }
    }, loginSessionTtlMs);

    return { sessionId, session };
}

export function waitForCode(session: LoginSession): Promise<string> {
    if (session.inputPromise) {
        return session.inputPromise;
    }

    session.needsCode = true;
    session.inputPromise = new Promise<string>((resolve, reject) => {
        session.resolveInput = resolve;
        session.rejectInput = reject;
    });
    return session.inputPromise;
}

export function resolveLoginCode(session: LoginSession, code: string): boolean {
    const resolveInput = session.resolveInput;
    if (!resolveInput) {
        return false;
    }

    session.inputPromise = undefined;
    session.needsCode = false;
    session.rejectInput = undefined;
    session.resolveInput = undefined;
    resolveInput(code);
    return true;
}

export function createStartSignal(): {
    started: Promise<LoginStartResult>;
    resolveStart: (value: LoginStartResult) => void;
    failStart: (error: unknown) => void;
} {
    let settled = false;
    let settle: (value: LoginStartResult) => void;
    let fail: (reason?: unknown) => void;
    const started = new Promise<LoginStartResult>((resolve, reject) => {
        settle = resolve;
        fail = reject;
    });

    return {
        failStart: (error) => {
            if (settled) {
                return;
            }
            settled = true;
            fail(error);
        },
        resolveStart: (value) => {
            if (settled) {
                return;
            }
            settled = true;
            settle(value);
        },
        started,
    };
}

export interface LoginControllerOptions {
    provider: OAuthProviderId;
    session: LoginSession;
    completeStart: () => void;
    failStart: (error: unknown) => void;
}

export function buildLoginController(options: LoginControllerOptions) {
    const { provider, session, completeStart, failStart } = options;
    return {
        onAuth: (auth) => {
            if (!auth.url) {
                const error = new Error("OAuth provider did not provide an authorization URL");
                session.state = "error";
                session.message = error.message;
                failStart(error);
                return;
            }

            session.url = auth.url;
            session.instructions = auth.instructions;
            completeStart();
        },
        onProgress: (progress) => {
            if (progress) {
                session.message = session.message ? `${session.message}\n${progress}` : progress;
            }
        },
        onPrompt: async ({ message }) => {
            if (message) {
                session.message = session.message ? `${session.message}\n${message}` : message;
            }
            return PASTE_CODE_LOGIN_PROVIDERS.has(provider) ? waitForCode(session) : "";
        },
        ...(PASTE_CODE_LOGIN_PROVIDERS.has(provider) ? { onManualCodeInput: async () => waitForCode(session) } : {}),
    } satisfies Parameters<AuthStorage["login"]>[1];
}

export interface LoginFlowOptions {
    storage: AuthStorage;
    provider: OAuthProviderId;
    session: LoginSession;
    controller: Parameters<AuthStorage["login"]>[1];
    failStart: (error: unknown) => void;
}

export function runLoginFlow(options: LoginFlowOptions): void {
    const { storage, provider, session, controller, failStart } = options;
    let loginPromise: Promise<unknown>;
    try {
        loginPromise = Promise.resolve(storage.login(provider, controller));
    } catch (error) {
        loginPromise = Promise.reject(error);
    }

    void loginPromise
        .then(() => {
            session.needsCode = false;
            session.state = "done";
        })
        .catch((error: unknown) => {
            session.state = "error";
            session.message = errorMessage(error);
            failStart(error);
        })
        .finally(() => {
            void Promise.resolve(storage.reload()).catch((error: unknown) => {
                const message = `Credential reload failed: ${errorMessage(error)}`;
                session.message = session.message ? `${session.message}\n${message}` : message;
            });
        });
}
