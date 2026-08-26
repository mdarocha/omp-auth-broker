import { h } from "preact";
import htm from "htm";
import type { AsyncState, Credential, Snapshot } from "../app";

const html = htm.bind(h);

export type AccountsProps = {
    snapshot: AsyncState<Snapshot>;
    removing: string | null;
    removeError: string | null;
    onRetry: () => void;
    onChooseProvider: () => void;
    onRemoveProvider: (provider: string) => void;
};

const absoluteDate = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

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
    return future
        ? `in ${amount} ${unit}${amount === 1 ? "" : "s"}`
        : `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

function formatDate(value?: number): string {
    return value && Number.isFinite(value) ? absoluteDate.format(value) : "No expiry";
}

function identityFor(credential: Credential): string {
    return (
        credential.credential.email ||
        credential.credential.orgName ||
        credential.credential.accountId ||
        credential.identityKey ||
        "Default account"
    );
}

export function Accounts({
    snapshot,
    removing,
    removeError,
    onRetry,
    onChooseProvider,
    onRemoveProvider,
}: AccountsProps) {
    return html`
        ${removeError && html`<p class="notice notice--error" role="alert">Account removal failed: ${removeError}</p>`}
        <div class="table-frame">
            ${snapshot.phase === "loading" && html`<p class="notice" role="status">Reading the shared vault…</p>`}
            ${
                snapshot.phase === "error" &&
                html`
                    <div class="state-block">
                        <p class="notice notice--error" role="alert">
                            Accounts could not be loaded: ${snapshot.message}
                        </p>
                        <button class="button button--secondary" type="button" onClick=${onRetry}>Try again</button>
                    </div>
                `
            }
            ${
                snapshot.phase === "ready" &&
                snapshot.data.credentials.length === 0 &&
                html`
                    <div class="empty-state">
                        <p class="label">Vault empty</p>
                        <h3>Connect your first provider</h3>
                        <p>Credentials added here are available to omp clients using this broker.</p>
                        <button class="button button--secondary" type="button" onClick=${onChooseProvider}>
                            Choose provider
                        </button>
                    </div>
                `
            }
            ${
                snapshot.phase === "ready" &&
                snapshot.data.credentials.length > 0 &&
                html`
                    <table>
                        <thead>
                            <tr>
                                <th>Provider</th>
                                <th>Identity</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Expires</th>
                                <th>Refresh in</th>
                                <th><span class="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${snapshot.data.credentials.map((entry) => {
                                const disabled = Boolean(entry.disabled || entry.credential.disabled);
                                return html`<tr key=${entry.id}>
                                    <td class="provider-cell">${entry.provider}</td>
                                    <td>${identityFor(entry)}</td>
                                    <td class="mono">${entry.credential.type.replace("_", " ")}</td>
                                    <td>
                                        <span class=${`status status--${disabled ? "disabled" : "active"}`}
                                            >${disabled ? "Disabled" : "Active"}</span
                                        >
                                    </td>
                                    <td class="numeric">
                                        <span>${formatDate(entry.credential.expires)}</span
                                        >${entry.credential.expires && html`<small>${relativeTime(entry.credential.expires - Date.now())}</small>`}
                                    </td>
                                    <td class="numeric">
                                        ${entry.rotatesInMs === null ? "—" : relativeTime(entry.rotatesInMs)}
                                    </td>
                                    <td class="action-cell">
                                        <button
                                            class="button button--danger"
                                            type="button"
                                            disabled=${removing !== null}
                                            onClick=${() => onRemoveProvider(entry.provider)}
                                        >
                                            ${removing === entry.provider ? "Removing…" : "Remove"}
                                        </button>
                                    </td>
                                </tr>`;
                            })}
                        </tbody>
                    </table>
                `
            }
        </div>
    `;
}
