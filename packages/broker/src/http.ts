export function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}

export function methodNotAllowed(allow: string): Response {
    return Response.json({ error: "Method not allowed" }, { headers: { allow }, status: 405 });
}

export function guardMethod(request: Request, allow: string): Response | undefined {
    return request.method === allow ? undefined : methodNotAllowed(allow);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function readJsonBody(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
}

export function withErrorBoundary<T extends unknown[]>(
    handler: (...args: T) => Response | Promise<Response>,
): (...args: T) => Promise<Response> {
    return async (...args: T) => {
        try {
            return await handler(...args);
        } catch (error) {
            return json({ error: errorMessage(error) }, 500);
        }
    };
}
