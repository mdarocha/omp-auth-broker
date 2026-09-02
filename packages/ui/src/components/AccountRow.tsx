import { formatDate, relativeTime } from "../lib/format";
import type { Credential } from "../api/types";
import { Icon } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { StatusBadge } from "./StatusBadge";
import trash from "lucide-static/icons/trash-2.svg" with { type: "text" };
import { useNow } from "../lib/useNow";

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
    const now = useNow();
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
                {credential.credential.expires && <small>{relativeTime(credential.credential.expires - now)}</small>}
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
                    <Icon svg={trash} />
                </button>
            </td>
        </tr>
    );
}
