import { formatDate, relativeTime } from "../lib/format";
import type { UsageAmount, UsageLimit, UsageReport } from "../api/types";

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

function reportRow(report: UsageReport, limit: UsageLimit) {
    const fraction = usedFraction(limit.amount);
    return (
        <tr key={`${report.provider}-${report.fetchedAt}-${limit.id}`}>
            <td className="provider-cell">{report.provider}</td>
            <td>{reportIdentity(report)}</td>
            <td>
                {limit.label}
                {limit.window?.label && <small>{limit.window.label}</small>}
            </td>
            <td className="numeric usage-amount">
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
            <td className="numeric">
                {limit.window?.resetsAt ? (
                    <>
                        <span>{formatDate(limit.window.resetsAt, "—")}</span>
                        <small>{relativeTime(limit.window.resetsAt - Date.now())}</small>
                    </>
                ) : (
                    "—"
                )}
            </td>
            <td>
                <span className={`status status--${limit.status || "unknown"}`}>{limit.status || "Unknown"}</span>
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
