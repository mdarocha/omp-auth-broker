import { formatDate, relativeTime } from "../lib/format";
import type { ClientUsage } from "../api/types";

const number = new Intl.NumberFormat("en-US");

interface ClientUsageTableProps {
    clients: ClientUsage[];
}

export function ClientUsageTable({ clients }: ClientUsageTableProps) {
    return (
        <table>
            <thead>
                <tr>
                    <th>Client</th>
                    <th>Providers</th>
                    <th>Calls</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Cache</th>
                    <th>Total tokens</th>
                    <th>Last seen</th>
                </tr>
            </thead>
            <tbody>
                {clients.map((client) => {
                    const totals = client.providers.reduce(
                        (sum, item) => ({
                            requests: sum.requests + item.requests,
                            input: sum.input + item.inputTokens,
                            output: sum.output + item.outputTokens,
                            cache: sum.cache + item.cacheReadTokens + item.cacheWriteTokens,
                        }),
                        { requests: 0, input: 0, output: 0, cache: 0 },
                    );
                    return (
                        <tr key={client.installId}>
                            <td>
                                <span>{client.hostname || "Unnamed client"}</span>
                                <small className="mono">{client.installId}</small>
                            </td>
                            <td>{client.providers.map((item) => item.provider).join(", ") || "—"}</td>
                            <td className="numeric">{number.format(totals.requests)}</td>
                            <td className="numeric">{number.format(totals.input)}</td>
                            <td className="numeric">{number.format(totals.output)}</td>
                            <td className="numeric">{number.format(totals.cache)}</td>
                            <td className="numeric numeric--strong">
                                {number.format(totals.input + totals.output + totals.cache)}
                            </td>
                            <td className="numeric">
                                <span>{formatDate(client.lastSeen, "Unknown")}</span>
                                <small>{relativeTime(client.lastSeen - Date.now())}</small>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
