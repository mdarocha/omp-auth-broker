const BRACKETED_AUTHORITY = /^\[([^\]]+)](?::\d+)?$/;
const AUTHORITY = /^([^:\s]+)(?::\d+)?$/;
const LOOPBACK_HOSTS: Record<string, true> = { "127.0.0.1": true, "::1": true, localhost: true };

export function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function rejectDisallowedHost(request: Request, allowedHostname?: string): Response | undefined {
    if (isAllowedHost(request.headers.get("host"), allowedHostname)) {
        return undefined;
    }
    return json({ error: "Misdirected Request" }, 421);
}

export function isAllowedHost(host: string | null, allowedHostname?: string): boolean {
    if (host === null) {
        return false;
    }

    const hostname = hostnameFromAuthority(host);
    if (hostname === undefined) {
        return false;
    }

    const normalizedHostname = hostname.toLowerCase();
    return Object.hasOwn(LOOPBACK_HOSTS, normalizedHostname) || normalizedHostname === allowedHostname?.toLowerCase();
}

function hostnameFromAuthority(authority: string): string | undefined {
    if (authority === "::1") {
        return authority;
    }

    const match = BRACKETED_AUTHORITY.exec(authority) ?? AUTHORITY.exec(authority);
    return match?.[1];
}

export async function readJsonBody(request: Request): Promise<unknown> {
    if (request.headers.get("sec-fetch-site") === "cross-site") {
        return json({ error: "Cross-site requests are not allowed" }, 403);
    }

    const contentType = request.headers.get("content-type");
    if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
        return json({ error: "Content-Type must be application/json" }, 415);
    }

    try {
        return await request.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
}
