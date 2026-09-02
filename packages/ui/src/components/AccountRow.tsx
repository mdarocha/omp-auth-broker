import { formatDate, relativeTime } from "../lib/format";
import type { Credential } from "../api/types";
import { ProviderIcon } from "./ProviderIcon";
import { StatusBadge } from "./StatusBadge";

interface AccountRowProps {
    credential: Credential;
    removing: boolean;
    onRemove: () => void;
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

export function AccountRow({ credential, removing, onRemove }: AccountRowProps) {
    const disabled = Boolean(credential.disabled || credential.credential.disabled);
    return (
        <tr>
            <td className="provider-cell" data-label="Provider">
                <span className="provider-cell__inner">
                    <ProviderIcon providerId={credential.provider} />
                    {credential.provider}
                </span>
            </td>
            <td data-label="Identity">{identityFor(credential)}</td>
            <td className="mono" data-label="Type">
                {credential.credential.type.replace("_", " ")}
            </td>
            <td data-label="Status">
                <StatusBadge
                    kind={disabled ? "disabled" : "active"}
                    label={disabled ? "Disabled" : "Active"}
                    explanation={
                        disabled
                            ? "This credential is disabled and will not be used to serve requests."
                            : "This credential is healthy and available to serve requests."
                    }
                />
            </td>
            <td className="numeric" data-label="Expires">
                <span>{formatDate(credential.credential.expires, "No expiry")}</span>
                {credential.credential.expires && (
                    <small>{relativeTime(credential.credential.expires - Date.now())}</small>
                )}
            </td>
            <td className="numeric" data-label="Refresh in">
                {credential.rotatesInMs === null ? "—" : relativeTime(credential.rotatesInMs)}
            </td>
            <td className="action-cell" data-label="">
                <button
                    className="icon-button icon-button--danger"
                    type="button"
                    disabled={removing}
                    onClick={onRemove}
                    aria-label={removing ? "Removing…" : "Remove"}
                    title={removing ? "Removing…" : "Remove"}
                >
                    <TrashIcon />
                </button>
            </td>
        </tr>
    );
}

function TrashIcon() {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
                fill="currentColor"
                d="M6 1.5A1.5 1.5 0 0 0 4.5 3v.5H2a.5.5 0 0 0 0 1h.5v9A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-9H14a.5.5 0 0 0 0-1h-2.5V3A1.5 1.5 0 0 0 10 1.5H6ZM5.5 3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v.5h-5V3Zm-1.5 1.5h8v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5v-9Zm2.5 2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5Zm3 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5a.5.5 0 0 1 .5-.5Z"
            />
        </svg>
    );
}
