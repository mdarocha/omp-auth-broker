import { formatDate, relativeTime } from "../lib/format";
import type { UsageAmount, UsageLimit, UsageReport } from "../api/types";
import { ProviderIcon } from "./ProviderIcon";
import { StatusBadge } from "./StatusBadge";

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

interface UsageReportTableProps {
    reports: UsageReport[];
}

function reportIdentity(report: UsageReport): string {
    const metadata = report.metadata ?? {};
    const candidate = metadata.email ?? metadata.accountId ?? metadata.orgName ?? metadata.plan;
    return typeof candidate === "string" && candidate ? candidate : "Default account";
}

function usedFraction(amount: UsageAmount): number | undefined {
    if (amount.usedFraction !== undefined) {
        return amount.usedFraction;
    }
    if (amount.used !== undefined && amount.limit !== undefined && amount.limit > 0) {
        return amount.used / amount.limit;
    }
    if (amount.unit === "percent" && amount.used !== undefined) {
        return amount.used / 100;
    }
    if (amount.remainingFraction !== undefined) {
        return Math.max(0, 1 - amount.remainingFraction);
    }
    return undefined;
}

function formatAmount(value: number | undefined, unit: string): string {
    if (value === undefined) {
        return "—";
    }
    if (unit === "usd") {
        return `$${value.toFixed(2)}`;
    }
    if (unit === "percent") {
        return `${Math.round(value)}%`;
    }
    return `${compactNumber.format(value)}${unit === "unknown" ? "" : ` ${unit}`}`;
}

const STATUS_EXPLANATIONS: Record<string, string> = {
    ok: "Usage is within the reported limit.",
    warning: "Usage is approaching the reported limit.",
    exhausted: "The reported limit has been used up.",
    unknown: "The provider did not report a status for this limit.",
};

function reportRow(report: UsageReport, limit: UsageLimit) {
    const fraction = usedFraction(limit.amount);
    const status = limit.status || "unknown";
    return (
        <tr key={`${report.provider}-${report.fetchedAt}-${limit.id}`}>
            <td className="provider-cell" data-label="Provider">
                <span className="provider-cell__inner">
                    <ProviderIcon providerId={report.provider} />
                    {report.provider}
                </span>
            </td>
            <td data-label="Identity">{reportIdentity(report)}</td>
            <td data-label="Limit">
                {limit.label}
                {limit.window?.label && <small>{limit.window.label}</small>}
            </td>
            <td className="numeric usage-amount" data-label="Used / limit">
                <span>
                    {formatAmount(limit.amount.used, limit.amount.unit)} /{" "}
                    {formatAmount(limit.amount.limit, limit.amount.unit)}
                </span>
                {fraction !== undefined && (
                    <progress
                        max="1"
                        value={Math.min(Math.max(fraction, 0), 1)}
                        aria-label={`${Math.round(fraction * 100)} percent used`}
                    />
                )}
            </td>
            <td className="numeric" data-label="Reset">
                {limit.window?.resetsAt ? (
                    <>
                        <span>{formatDate(limit.window.resetsAt, "—")}</span>
                        <small>{relativeTime(limit.window.resetsAt - Date.now())}</small>
                    </>
                ) : (
                    "—"
                )}
            </td>
            <td data-label="Status">
                <StatusBadge
                    kind={status}
                    label={limit.status || "Unknown"}
                    explanation={STATUS_EXPLANATIONS[status] ?? STATUS_EXPLANATIONS.unknown}
                />
            </td>
        </tr>
    );
}

export function UsageReportTable({ reports }: UsageReportTableProps) {
    const rows = reports.flatMap((report) => report.limits.map((limit) => ({ report, limit })));
    return (
        <table>
            <thead>
                <tr>
                    <th>Provider</th>
                    <th>Identity</th>
                    <th>Limit</th>
                    <th>Used / limit</th>
                    <th>Reset</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>{rows.map(({ report, limit }) => reportRow(report, limit))}</tbody>
        </table>
    );
}
