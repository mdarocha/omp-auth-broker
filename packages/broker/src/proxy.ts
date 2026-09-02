import { logOutgoingRequest } from "./request-log";

export function forwardUpstream(response: Response): Response {
    return new Response(response.body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
    });
}

export async function fetchBroker(brokerBase: string, path: string): Promise<Response> {
    const url = `${brokerBase}${path}`;
    const startedAt = performance.now();
    try {
        const response = await fetch(url);
        logOutgoingRequest({ method: "GET", startedAt, status: response.status, url });
        return response;
    } catch (error) {
        logOutgoingRequest({ error, method: "GET", startedAt, url });
        throw error;
    }
}

export async function proxyToBroker(request: Request, brokerBase: string): Promise<Response> {
    const url = new URL(request.url);
    const target = `${brokerBase}${url.pathname}${url.search}`;
    const startedAt = performance.now();
    try {
        const response = await fetch(target, {
            body: request.body,
            duplex: "half",
            headers: request.headers,
            method: request.method,
        } as RequestInit & { duplex: "half" });
        logOutgoingRequest({ method: request.method, startedAt, status: response.status, url: target });
        return forwardUpstream(response);
    } catch (error) {
        logOutgoingRequest({ error, method: request.method, startedAt, url: target });
        throw error;
    }
}
