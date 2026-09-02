import { useEffect, useState } from "preact/hooks";

/** Current time in ms, refreshed on an interval so relative-time displays stay live. */
export function useNow(intervalMs = 30_000): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
        }, intervalMs);
        return () => {
            clearInterval(id);
        };
    }, [intervalMs]);

    return now;
}
