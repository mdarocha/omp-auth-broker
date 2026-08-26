import { h } from "preact";
import htm from "htm";
import type { AsyncState, Usage as UsageData, UsageAmount, UsageLimit, UsageReport } from "../app";

const html = htm.bind(h);
const number = new Intl.NumberFormat("en-US");
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const absoluteDate = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

export type UsageRow = { report: UsageReport; limit: UsageLimit };

export type UsageProps = {
	usage: AsyncState<UsageData>;
	reportRows: UsageRow[];
	onRetry: () => void;
};

function relativeTime(ms: number): string {
	if (!Number.isFinite(ms)) return "Unknown";
	const future = ms >= 0;
	const value = Math.abs(ms);
	let amount: number;
	let unit: string;
	if (value < 60_000) {
		amount = Math.max(1, Math.round(value / 1_000));
		unit = "sec";
	} else if (value < 3_600_000) {
		amount = Math.round(value / 60_000);
		unit = "min";
	} else if (value < 86_400_000) {
		amount = Math.round(value / 3_600_000);
		unit = "hr";
	} else {
		amount = Math.round(value / 86_400_000);
		unit = "day";
	}
	return future ? `in ${amount} ${unit}${amount === 1 ? "" : "s"}` : `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

function formatDate(value?: number): string {
	return value && Number.isFinite(value) ? absoluteDate.format(value) : "No expiry";
}

function reportIdentity(report: UsageReport): string {
	const metadata = report.metadata ?? {};
	const candidate = metadata.email ?? metadata.accountId ?? metadata.orgName ?? metadata.plan;
	return typeof candidate === "string" && candidate ? candidate : "Default account";
}

function usedFraction(amount: UsageAmount): number | undefined {
	if (amount.usedFraction !== undefined) return amount.usedFraction;
	if (amount.used !== undefined && amount.limit !== undefined && amount.limit > 0) return amount.used / amount.limit;
	if (amount.unit === "percent" && amount.used !== undefined) return amount.used / 100;
	if (amount.remainingFraction !== undefined) return Math.max(0, 1 - amount.remainingFraction);
	return undefined;
}

function formatAmount(value: number | undefined, unit: string): string {
	if (value === undefined) return "—";
	if (unit === "usd") return `$${value.toFixed(2)}`;
	if (unit === "percent") return `${Math.round(value)}%`;
	return `${compactNumber.format(value)}${unit === "unknown" ? "" : ` ${unit}`}`;
}

export function Usage({ usage, reportRows, onRetry }: UsageProps) {
	return html`
		<section class="section" aria-labelledby="usage-heading">
			<div class="section__head section__head--usage">
				<div>
					<p class="section__index">02 / Meter</p>
					<h2 id="usage-heading">Usage</h2>
				</div>
				${usage.phase === "ready" && usage.data.generatedAt && html`<p class="updated">Updated ${relativeTime(usage.data.generatedAt - Date.now())}</p>`}
			</div>

			<div class="usage-block">
				<div class="subhead"><h3>Credential limits</h3><span>${reportRows.length} ${reportRows.length === 1 ? "window" : "windows"}</span></div>
				<div class="table-frame">
					${usage.phase === "loading" && html`<p class="notice" role="status">Fetching provider usage…</p>`}
					${usage.phase === "error" && html`
						<div class="state-block">
							<p class="notice notice--error" role="alert">Usage could not be loaded: ${usage.message}</p>
							<button class="button button--secondary" type="button" onClick=${onRetry}>Try again</button>
						</div>
					`}
					${usage.phase === "ready" && reportRows.length === 0 && html`<div class="empty-state empty-state--compact"><p>No provider limits have been reported yet.</p><span>Usage appears after a connected provider exposes quota data.</span></div>`}
					${usage.phase === "ready" && reportRows.length > 0 && html`
						<table>
							<thead><tr><th>Provider</th><th>Identity</th><th>Limit</th><th>Used / limit</th><th>Reset</th><th>Status</th></tr></thead>
							<tbody>${reportRows.map(({ report, limit }) => {
								const fraction = usedFraction(limit.amount);
								return html`<tr key=${`${report.provider}-${report.fetchedAt}-${limit.id}`}>
									<td class="provider-cell">${report.provider}</td><td>${reportIdentity(report)}</td><td>${limit.label}${limit.window?.label && html`<small>${limit.window.label}</small>`}</td>
									<td class="numeric usage-amount"><span>${formatAmount(limit.amount.used, limit.amount.unit)} / ${formatAmount(limit.amount.limit, limit.amount.unit)}</span>${fraction !== undefined && html`<progress max="1" value=${Math.min(Math.max(fraction, 0), 1)} aria-label=${`${Math.round(fraction * 100)} percent used`}></progress>`}</td>
									<td class="numeric">${limit.window?.resetsAt ? html`<span>${formatDate(limit.window.resetsAt)}</span><small>${relativeTime(limit.window.resetsAt - Date.now())}</small>` : "—"}</td>
									<td><span class=${`status status--${limit.status || "unknown"}`}>${limit.status || "Unknown"}</span></td>
								</tr>`;
							})}</tbody>
						</table>
					`}
				</div>
			</div>

			<div class="usage-block">
				<div class="subhead"><h3>Client activity</h3><span>Last 30 days</span></div>
				<div class="table-frame">
					${usage.phase === "loading" && html`<p class="notice" role="status">Aggregating client calls…</p>`}
					${usage.phase === "error" && html`<p class="notice notice--error" role="alert">Client activity is unavailable.</p>`}
					${usage.phase === "ready" && usage.data.clients.length === 0 && html`<div class="empty-state empty-state--compact"><p>No client calls in this window.</p><span>Requests made through the broker will appear here.</span></div>`}
					${usage.phase === "ready" && usage.data.clients.length > 0 && html`
						<table>
							<thead><tr><th>Client</th><th>Providers</th><th>Calls</th><th>Input</th><th>Output</th><th>Cache</th><th>Total tokens</th><th>Last seen</th></tr></thead>
							<tbody>${usage.data.clients.map(client => {
								const totals = client.providers.reduce((sum, item) => ({ requests: sum.requests + item.requests, input: sum.input + item.inputTokens, output: sum.output + item.outputTokens, cache: sum.cache + item.cacheReadTokens + item.cacheWriteTokens }), { requests: 0, input: 0, output: 0, cache: 0 });
								return html`<tr key=${client.installId}>
									<td><span>${client.hostname || "Unnamed client"}</span><small class="mono">${client.installId}</small></td><td>${client.providers.map(item => item.provider).join(", ") || "—"}</td>
									<td class="numeric">${number.format(totals.requests)}</td><td class="numeric">${number.format(totals.input)}</td><td class="numeric">${number.format(totals.output)}</td><td class="numeric">${number.format(totals.cache)}</td><td class="numeric numeric--strong">${number.format(totals.input + totals.output + totals.cache)}</td><td class="numeric"><span>${formatDate(client.lastSeen)}</span><small>${relativeTime(client.lastSeen - Date.now())}</small></td>
								</tr>`;
							})}</tbody>
						</table>
					`}
				</div>
			</div>
		</section>
	`;
}
