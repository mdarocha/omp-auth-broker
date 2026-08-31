export function forwardUpstream(response: Response): Response {
    return new Response(response.body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
    });
}

export function fetchBroker(brokerBase: string, path: string): Promise<Response> {
    return fetch(`${brokerBase}${path}`);
}

export async function proxyToBroker(request: Request, brokerBase: string): Promise<Response> {
    const url = new URL(request.url);
    const response = await fetch(`${brokerBase}${url.pathname}${url.search}`, {
        body: request.body,
        duplex: "half",
        headers: request.headers,
        method: request.method,
    } as RequestInit & { duplex: "half" });

    return forwardUpstream(response);
}
