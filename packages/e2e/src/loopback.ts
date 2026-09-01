export const LOOPBACK_HOSTNAMES: Record<string, true> = {
    "127.0.0.1": true,
    "::1": true,
    localhost: true,
};

export function assertLoopbackHttpUrl(value: string): URL {
    const url = new URL(value);
    if (url.protocol !== "http:" || !Object.hasOwn(LOOPBACK_HOSTNAMES, url.hostname)) {
        throw new Error(`Expected a loopback HTTP URL, received ${value}`);
    }
    return url;
}
