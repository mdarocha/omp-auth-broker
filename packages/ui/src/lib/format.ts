const absoluteDate = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

function relativeTimeParts(value: number): [amount: number, unit: string] {
    if (value < 60_000) {
        return [Math.max(1, Math.round(value / 1_000)), "sec"];
    }
    if (value < 3_600_000) {
        return [Math.round(value / 60_000), "min"];
    }
    if (value < 86_400_000) {
        return [Math.round(value / 3_600_000), "hr"];
    }
    return [Math.round(value / 86_400_000), "day"];
}

function formatRelativeTime(amount: number, unit: string, future: boolean): string {
    const suffix = amount === 1 ? "" : "s";
    return future ? `in ${amount} ${unit}${suffix}` : `${amount} ${unit}${suffix} ago`;
}

export function relativeTime(ms: number): string {
    if (!Number.isFinite(ms)) {
        return "Unknown";
    }
    const [amount, unit] = relativeTimeParts(Math.abs(ms));
    return formatRelativeTime(amount, unit, ms >= 0);
}

export function formatDate(value: number | undefined, fallback: string): string {
    if (value && Number.isFinite(value)) {
        return absoluteDate.format(value);
    }
    return fallback;
}
