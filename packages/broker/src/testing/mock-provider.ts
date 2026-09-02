import { createHash, randomBytes } from "node:crypto";
import { MOCK_AUTHORIZE_PATH, MOCK_TOKEN_PATH } from "./mock-provider-server";
import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@oh-my-pi/pi-ai/registry/oauth";
import { registerOAuthProvider, unregisterOAuthProvider } from "@oh-my-pi/pi-ai/oauth";

export const MOCK_PROVIDER_ID = "mock-provider";

const HTTP_FOUND = 302;
const LOOPBACK_HOSTNAMES: Record<string, true> = {
    "127.0.0.1": true,
    "::1": true,
    localhost: true,
};
const MOCK_REDIRECT_URI = "http://127.0.0.1/mock-provider-callback";
const MOCK_EMAIL = "mock-user@localhost";

export interface RegisterMockProviderOptions {
    serverUrl: string;
}

interface MockTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

export function registerMockProvider({ serverUrl }: RegisterMockProviderOptions): { unregister: () => void } {
    const baseUrl = normalizeServerUrl(serverUrl);
    let loginSequence = 0;
    const provider: OAuthProviderInterface = {
        id: MOCK_PROVIDER_ID,
        name: "Mock Provider",
        login: async (callbacks) => {
            loginSequence += 1;
            return login(baseUrl, callbacks, loginSequence);
        },
        refreshToken: async (credentials, signal) => {
            const tokens = await requestToken(
                baseUrl,
                new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: credentials.refresh,
                }),
                signal,
            );
            return toCredentials(tokens, credentials);
        },
    };

    registerOAuthProvider(provider);
    return { unregister: () => unregisterOAuthProvider(MOCK_PROVIDER_ID) };
}

function normalizeServerUrl(serverUrl: string): string {
    const url = new URL(serverUrl);
    if (url.protocol !== "http:" || !Object.hasOwn(LOOPBACK_HOSTNAMES, url.hostname)) {
        throw new Error("Mock provider server must use an HTTP loopback URL");
    }
    return url.toString();
}

function buildAuthorizeUrl(serverUrl: string, state: string, verifier: string): URL {
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorizeUrl = new URL(MOCK_AUTHORIZE_PATH, serverUrl);
    authorizeUrl.search = new URLSearchParams({
        client_id: MOCK_PROVIDER_ID,
        code_challenge: challenge,
        code_challenge_method: "S256",
        redirect_uri: MOCK_REDIRECT_URI,
        response_type: "code",
        state,
    }).toString();
    return authorizeUrl;
}

async function requestAuthorization(authorizeUrl: URL, callbacks: OAuthLoginCallbacks): Promise<string> {
    const response = await fetch(authorizeUrl, { redirect: "manual", signal: callbacks.signal });
    if (response.status !== HTTP_FOUND) {
        throw new Error(`Mock authorization request failed with status ${response.status}`);
    }

    const redirect = response.headers.get("location");
    if (!redirect) {
        throw new Error("Mock authorization response did not redirect");
    }
    return redirect;
}

function parseAuthorizationCallback(redirect: string, state: string): string {
    const callbackUrl = new URL(redirect);
    const code = callbackUrl.searchParams.get("code");
    if (!code || callbackUrl.searchParams.get("state") !== state) {
        throw new Error("Mock authorization response was invalid");
    }
    return code;
}

async function login(serverUrl: string, callbacks: OAuthLoginCallbacks, sequence: number): Promise<OAuthCredentials> {
    const state = randomBytes(16).toString("hex");
    const verifier = randomBytes(96).toString("base64url");
    const authorizeUrl = buildAuthorizeUrl(serverUrl, state, verifier);

    callbacks.onAuth({ url: authorizeUrl.toString() });
    const redirect = await requestAuthorization(authorizeUrl, callbacks);
    const code = parseAuthorizationCallback(redirect, state);

    const tokens = await requestToken(
        serverUrl,
        new URLSearchParams({
            code,
            code_verifier: verifier,
            grant_type: "authorization_code",
            redirect_uri: MOCK_REDIRECT_URI,
        }),
        callbacks.signal,
    );
    return toCredentials(tokens, undefined, sequence);
}

function parseMockTokenResponse(body: string): MockTokenResponse {
    let tokens: unknown;
    try {
        tokens = JSON.parse(body);
    } catch {
        throw new Error("Mock token response was not JSON");
    }
    if (!isMockTokenResponse(tokens)) {
        throw new Error("Mock token response was invalid");
    }
    return tokens;
}

async function requestToken(
    serverUrl: string,
    params: URLSearchParams,
    signal?: AbortSignal,
): Promise<MockTokenResponse> {
    const response = await fetch(new URL(MOCK_TOKEN_PATH, serverUrl), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal,
    });
    const body = await response.text();
    if (!response.ok) {
        throw new Error(`Mock token request failed with status ${response.status}: ${body}`);
    }

    return parseMockTokenResponse(body);
}

function isMockTokenResponse(value: unknown): value is MockTokenResponse {
    return (
        typeof value === "object" &&
        value !== null &&
        "access_token" in value &&
        typeof value.access_token === "string" &&
        "refresh_token" in value &&
        typeof value.refresh_token === "string" &&
        "expires_in" in value &&
        typeof value.expires_in === "number" &&
        Number.isFinite(value.expires_in) &&
        value.expires_in > 0
    );
}

function toCredentials(tokens: MockTokenResponse, previous?: OAuthCredentials, sequence = 1): OAuthCredentials {
    return {
        ...previous,
        access: tokens.access_token,
        email: previous?.email ?? mockEmailForSequence(sequence),
        expires: Date.now() + tokens.expires_in * 1000,
        refresh: tokens.refresh_token,
    };
}

// The first login always gets the well-known MOCK_EMAIL identity so existing assertions stay stable.
// Later logins get distinct identities so screenshots can show multiple accounts for one provider.
function mockEmailForSequence(sequence: number): string {
    return sequence <= 1 ? MOCK_EMAIL : `mock-user-${sequence}@localhost`;
}
