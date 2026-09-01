export function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
