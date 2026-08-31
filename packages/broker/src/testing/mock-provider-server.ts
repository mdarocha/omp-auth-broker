import { createHash, randomBytes } from "node:crypto";

export const MOCK_AUTHORIZE_PATH = "/authorize";
export const MOCK_TOKEN_PATH = "/token";

const LOOPBACK_HOST = "127.0.0.1";
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 5;
const HTTP_FOUND = 302;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

export interface IssuedTokenPair {
    accessToken: string;
    refreshToken: string;
}

export interface MockProviderServer {
    url: string;
    port: number;
    stop: () => void;
    issuedTokens: IssuedTokenPair[];
    readonly refreshCount: number;
}

interface AuthorizationCodeRecord {
    codeChallenge: string | null;
    state: string | null;
    consumed: boolean;
    issuedAt: number;
}

interface MockGrantHandlers {
    issuedTokens: IssuedTokenPair[];
    handleAuthorize: (url: URL) => Response;
    handleToken: (request: Request) => Promise<Response>;
    refreshCount: { value: number };
}

function codeChallengeMatches(record: AuthorizationCodeRecord, verifier: string | null): boolean {
    if (!record.codeChallenge) {
        return true;
    }
    if (!verifier) {
        return false;
    }
    return createHash("sha256").update(verifier).digest("base64url") === record.codeChallenge;
}

function buildAuthorizeRedirect(redirectUri: string, code: string, state: string | null): string {
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) {
        target.searchParams.set("state", state);
    }
    return target.toString();
}

function createMockGrantHandlers(): MockGrantHandlers {
    const authorizationCodes = new Map<string, AuthorizationCodeRecord>();
    const activeRefreshTokens = new Set<string>();
    const issuedTokens: IssuedTokenPair[] = [];
    const refreshCount = { value: 0 };

    function issueTokenPair(): { access_token: string; refresh_token: string; expires_in: number } {
        const accessToken = randomBytes(32).toString("hex");
        const refreshToken = randomBytes(32).toString("hex");
        activeRefreshTokens.add(refreshToken);
        issuedTokens.push({ accessToken, refreshToken });
        return { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TOKEN_TTL_SECONDS };
    }

    function handleAuthorize(url: URL): Response {
        const redirectUri = url.searchParams.get("redirect_uri");
        if (!redirectUri) {
            return json({ error: "invalid_request" }, HTTP_BAD_REQUEST);
        }

        const code = randomBytes(32).toString("hex");
        const state = url.searchParams.get("state");
        authorizationCodes.set(code, {
            codeChallenge: url.searchParams.get("code_challenge"),
            consumed: false,
            issuedAt: Date.now(),
            state,
        });

        return Response.redirect(buildAuthorizeRedirect(redirectUri, code, state), HTTP_FOUND);
    }

    function handleRefreshGrant(params: URLSearchParams): Response {
        const refreshToken = params.get("refresh_token");
        if (!refreshToken || !activeRefreshTokens.has(refreshToken)) {
            return json({ error: "invalid_grant" }, HTTP_BAD_REQUEST);
        }
        activeRefreshTokens.delete(refreshToken);
        refreshCount.value += 1;
        return json(issueTokenPair());
    }

    function handleAuthorizationCodeGrant(params: URLSearchParams): Response {
        const code = params.get("code");
        const record = code ? authorizationCodes.get(code) : undefined;
        const expired = record !== undefined && Date.now() - record.issuedAt > AUTHORIZATION_CODE_TTL_MS;
        if (!record || record.consumed || expired || !codeChallengeMatches(record, params.get("code_verifier"))) {
            return json({ error: "invalid_grant" }, HTTP_BAD_REQUEST);
        }
        record.consumed = true;
        return json(issueTokenPair());
    }

    async function handleToken(request: Request): Promise<Response> {
        const params = new URLSearchParams(await request.text());
        const grantType = params.get("grant_type");

        if (grantType === "refresh_token") {
            return handleRefreshGrant(params);
        }
        if (grantType === "authorization_code") {
            return handleAuthorizationCodeGrant(params);
        }
        return json({ error: "unsupported_grant_type" }, HTTP_BAD_REQUEST);
    }

    return {
        issuedTokens,
        handleAuthorize,
        handleToken,
        refreshCount,
    };
}

export function startMockProviderServer(): MockProviderServer {
    const grants = createMockGrantHandlers();

    const server = Bun.serve({
        hostname: LOOPBACK_HOST,
        port: 0,
        fetch(request) {
            const url = new URL(request.url);
            if (request.method === "GET" && url.pathname === MOCK_AUTHORIZE_PATH) {
                return grants.handleAuthorize(url);
            }
            if (request.method === "POST" && url.pathname === MOCK_TOKEN_PATH) {
                return grants.handleToken(request);
            }
            return json({ error: "not_found" }, HTTP_NOT_FOUND);
        },
    });

    const port = server.port;
    if (typeof port !== "number") {
        void server.stop(true);
        throw new Error("Mock provider server failed to bind a TCP port");
    }

    return {
        url: `http://${LOOPBACK_HOST}:${port}`,
        port,
        stop: () => server.stop(true),
        issuedTokens: grants.issuedTokens,
        get refreshCount() {
            return grants.refreshCount.value;
        },
    };
}

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}
