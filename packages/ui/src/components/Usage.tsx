import { AsyncSection } from "./AsyncSection";
import { ClientUsageTable } from "./ClientUsageTable";
import { relativeTime } from "../lib/format";
import { UsageReportTable } from "./UsageReportTable";
import { useVault } from "../state/VaultContext";

export function Usage() {
    const { usage, reloadUsage } = useVault();

    return (
        <section className="section" aria-labelledby="usage-heading">
            <div className="section__head section__head--usage">
                <h2 id="usage-heading">Usage</h2>
                {usage.phase === "ready" && usage.data.generatedAt && (
                    <p className="updated">Updated {relativeTime(usage.data.generatedAt - Date.now())}</p>
                )}
            </div>

            <div className="usage-block">
                <div className="subhead">
                    <h3>Credential limits</h3>
                    <span>
                        {usage.phase === "ready" ? usage.data.reports.reduce((sum, r) => sum + r.limits.length, 0) : 0}{" "}
                        {usage.phase === "ready" &&
                        usage.data.reports.reduce((sum, r) => sum + r.limits.length, 0) === 1
                            ? "window"
                            : "windows"}
                    </span>
                </div>
                <div className="table-frame">
                    <AsyncSection
                        state={usage}
                        loading={<output className="notice">Fetching provider usage…</output>}
                        error={
                            <div className="state-block">
                                <p className="notice notice--error" role="alert">
                                    Usage could not be loaded: {usage.phase === "error" ? usage.message : ""}
                                </p>
                                <button className="button button--secondary" type="button" onClick={reloadUsage}>
                                    Try again
                                </button>
                            </div>
                        }
                        empty={(data) => data.reports.reduce((sum, r) => sum + r.limits.length, 0) === 0}
                        emptyContent={
                            <div className="empty-state empty-state--compact">
                                <p>No provider limits have been reported yet.</p>
                                <span>Usage appears after a connected provider exposes quota data.</span>
                            </div>
                        }
                    >
                        {(data) => <UsageReportTable reports={data.reports} />}
                    </AsyncSection>
                </div>
            </div>

            <div className="usage-block">
                <div className="subhead">
                    <h3>Client activity</h3>
                    <span>Last 30 days</span>
                </div>
                <div className="table-frame">
                    <AsyncSection
                        state={usage}
                        loading={<output className="notice">Aggregating client calls…</output>}
                        error={
                            <p className="notice notice--error" role="alert">
                                Client activity is unavailable.
                            </p>
                        }
                        empty={(data) => data.clients.length === 0}
                        emptyContent={
                            <div className="empty-state empty-state--compact">
                                <p>No client calls in this window.</p>
                                <span>Requests made through the broker will appear here.</span>
                            </div>
                        }
                    >
                        {(data) => <ClientUsageTable clients={data.clients} />}
                    </AsyncSection>
                </div>
            </div>
        </section>
    );
}
