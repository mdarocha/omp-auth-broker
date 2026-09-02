import { getOAuthProvider, getOAuthProviders, refreshOAuthToken } from "@oh-my-pi/pi-ai/oauth";
import type { OAuthCredential, OAuthProvider, SqliteAuthCredentialStore } from "@oh-my-pi/pi-ai";
import type { OAuthCredentials } from "@oh-my-pi/pi-ai/oauth/types";

function resolveResourceUri(resource: string | undefined): string | undefined {
    const trimmed = resource?.trim();
    if (!trimmed) {
        return undefined;
    }
    if (trimmed !== resource) {
        throw new Error("OAuth resource URI must not include surrounding whitespace");
    }
    const parsed = URL.parse(trimmed);
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hash) {
        throw new Error(
            parsed?.hash
                ? "OAuth resource URI must not include a fragment"
                : "OAuth resource URI must use http or https",
        );
    }
    return trimmed;
}
const MCP_OAUTH_CREDENTIAL_PREFIX = "mcp_oauth:";
const MCP_OAUTH_PROFILE_CREDENTIAL_PREFIX = `${MCP_OAUTH_CREDENTIAL_PREFIX}profile:`;
const MCP_OAUTH_LEGACY_CREDENTIAL_PREFIX = "mcp_oauth_";
const DEFAULT_EXPIRES_IN_SECONDS = 3600;
const MILLISECONDS_PER_SECOND = 1000;
export interface McpStoredOAuthCredential extends OAuthCredential {
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    resource?: string;
    authorizationUrl?: string;
}
interface RefreshTokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

interface McpRefreshMaterial {
    tokenUrl: string;
    clientId?: string;
    clientSecret?: string;
    resource?: string;
    authorizationUrl?: string;
}

const mcpRefreshMaterialCache = new Map<string, McpRefreshMaterial>();

export function cacheMcpRefreshMaterial(credentialId: string, credential: McpStoredOAuthCredential): void {
    if (credential.tokenUrl) {
        mcpRefreshMaterialCache.set(credentialId, {
            tokenUrl: credential.tokenUrl,
            clientId: credential.clientId,
            clientSecret: credential.clientSecret,
            resource: credential.resource,
            authorizationUrl: credential.authorizationUrl,
        });
    }
}
function materializeRefreshCredential(
    credentialId: string,
    credential: McpStoredOAuthCredential,
): McpStoredOAuthCredential {
    cacheMcpRefreshMaterial(credentialId, credential);
    const cached = mcpRefreshMaterialCache.get(credentialId);
    return {
        ...credential,
        authorizationUrl: credential.authorizationUrl ?? cached?.authorizationUrl,
        clientId: credential.clientId ?? cached?.clientId,
        clientSecret: credential.clientSecret ?? cached?.clientSecret,
        resource: credential.resource ?? cached?.resource,
        tokenUrl: credential.tokenUrl ?? cached?.tokenUrl,
    };
}

function isOAuthProvider(provider: string): provider is OAuthProvider {
    return getOAuthProviders().some(({ id }) => id === provider);
}
interface RefreshOptions {
    signal?: AbortSignal;
    rowId?: number;
    store?: SqliteAuthCredentialStore;
}

function parseRefreshTokenResponse(value: unknown): RefreshTokenResponse {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("MCP OAuth refresh returned an invalid response");
    }
    const accessToken = Reflect.get(value, "access_token");
    if (typeof accessToken !== "string" || accessToken.length === 0) {
        throw new Error("MCP OAuth refresh returned no access token");
    }
    const refreshToken = Reflect.get(value, "refresh_token");
    const expiresIn = Reflect.get(value, "expires_in");
    return {
        access_token: accessToken,
        ...(typeof refreshToken === "string" ? { refresh_token: refreshToken } : {}),
        ...(typeof expiresIn === "number" ? { expires_in: expiresIn } : {}),
    };
}

export function isManagedMcpOAuthCredentialId(provider: string): boolean {
    return provider.startsWith(MCP_OAUTH_CREDENTIAL_PREFIX) || provider.startsWith(MCP_OAUTH_LEGACY_CREDENTIAL_PREFIX);
}

export function mcpOAuthServerUrlFromCredentialId(credentialId: string): string | undefined {
    if (credentialId.startsWith(MCP_OAUTH_PROFILE_CREDENTIAL_PREFIX)) {
        const separator = credentialId.indexOf(":", MCP_OAUTH_PROFILE_CREDENTIAL_PREFIX.length);
        return separator === -1 ? undefined : credentialId.slice(separator + 1) || undefined;
    }
    if (credentialId.startsWith(MCP_OAUTH_CREDENTIAL_PREFIX)) {
        return credentialId.slice(MCP_OAUTH_CREDENTIAL_PREFIX.length) || undefined;
    }
    return undefined;
}

function filterResourceIndicator(
    resource: string | undefined,
    anchorUrl: string,
    stripSameOriginResource: boolean,
): string | undefined {
    if (!resource) {
        return undefined;
    }
    const anchor = URL.parse(anchorUrl);
    const parsed = URL.parse(resource);
    if (!anchor || !parsed || parsed.origin !== anchor.origin) {
        return resource;
    }
    return stripSameOriginResource ? undefined : resource;
}

function buildRefreshParams(credential: McpStoredOAuthCredential, resource: string | undefined): URLSearchParams {
    const params = new URLSearchParams({ grant_type: "refresh_token", refresh_token: credential.refresh });
    const clientId = credential.clientId?.trim();
    if (clientId) {
        params.set("client_id", clientId);
    }
    if (resource) {
        params.set("resource", resource);
    }
    if (credential.clientSecret) {
        params.set("client_secret", credential.clientSecret);
    }
    return params;
}

async function requestRefreshToken(
    tokenUrl: string,
    params: URLSearchParams,
    signal?: AbortSignal,
): Promise<RefreshTokenResponse> {
    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal,
    });
    if (!response.ok) {
        throw new Error(`MCP OAuth refresh failed: ${response.status} ${await response.text()}`);
    }
    return parseRefreshTokenResponse(await response.json());
}

function persistRefreshedCredential(options: RefreshOptions, credential: McpStoredOAuthCredential): void {
    if (options.rowId !== undefined && options.store) {
        options.store.updateAuthCredential(options.rowId, credential);
    }
}
function resolveRefreshResource(
    credentialId: string,
    credential: McpStoredOAuthCredential,
    tokenUrl: string,
): string | undefined {
    const serverUrl = mcpOAuthServerUrlFromCredentialId(credentialId);
    const resourceIsFallback = !credential.resource && Boolean(serverUrl);
    return filterResourceIndicator(
        resolveResourceUri(credential.resource ?? (resourceIsFallback ? serverUrl : undefined)),
        credential.authorizationUrl ?? tokenUrl,
        resourceIsFallback,
    );
}

export async function refreshMcpOAuthCredential(
    credentialId: string,
    credential: McpStoredOAuthCredential,
    options: RefreshOptions = {},
): Promise<OAuthCredentials> {
    const refreshCredential = materializeRefreshCredential(credentialId, credential);
    const tokenUrl = refreshCredential.tokenUrl;
    if (!refreshCredential.refresh || !tokenUrl) {
        throw new Error("MCP OAuth credential is missing refresh material");
    }

    const resource = resolveRefreshResource(credentialId, refreshCredential, tokenUrl);
    const data = await requestRefreshToken(tokenUrl, buildRefreshParams(refreshCredential, resource), options.signal);
    const merged: McpStoredOAuthCredential = {
        ...refreshCredential,
        access: data.access_token,
        expires: Date.now() + (data.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS) * MILLISECONDS_PER_SECOND,
        refresh: data.refresh_token ?? refreshCredential.refresh,
    };
    persistRefreshedCredential(options, merged);
    return merged;
}

export function refreshBrokerOAuthCredential(
    provider: string,
    credential: McpStoredOAuthCredential,
    options: RefreshOptions = {},
): Promise<OAuthCredentials> {
    if (isManagedMcpOAuthCredentialId(provider)) {
        return refreshMcpOAuthCredential(provider, credential, options);
    }
    const oauthProvider = getOAuthProvider(provider);
    if (oauthProvider?.refreshToken) {
        return oauthProvider.refreshToken(credential, options.signal);
    }
    if (!isOAuthProvider(provider)) {
        throw new Error(`Unknown OAuth provider: ${provider}`);
    }
    return refreshOAuthToken(provider, credential, options.signal);
}
