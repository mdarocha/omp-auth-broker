import { formatDate, relativeTime } from "../lib/format";
import type { Credential } from "../api/types";
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
            <td className="provider-cell">{credential.provider}</td>
            <td>{identityFor(credential)}</td>
            <td className="mono">{credential.credential.type.replace("_", " ")}</td>
            <td>
                <span className={`status status--${disabled ? "disabled" : "active"}`}>
                    {disabled ? "Disabled" : "Active"}
                </span>
            </td>
            <td className="numeric">
                <span>{formatDate(credential.credential.expires, "No expiry")}</span>
                {credential.credential.expires && <small>{relativeTime(credential.credential.expires - now)}</small>}
            </td>
            <td className="numeric">{credential.rotatesInMs === null ? "—" : relativeTime(credential.rotatesInMs)}</td>
            <td className="action-cell">
                <button className="button button--danger" type="button" disabled={removing} onClick={onRemove}>
                    {removing ? "Removing…" : "Remove"}
                </button>
            </td>
        </tr>
    );
}
