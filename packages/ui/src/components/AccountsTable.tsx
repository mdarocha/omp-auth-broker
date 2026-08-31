import { AccountRow } from "./AccountRow";
import type { Snapshot } from "../api/types";
import { useVault } from "../state/VaultContext";

interface AccountsTableProps {
    snapshot: Snapshot;
}

export function AccountsTable({ snapshot }: AccountsTableProps) {
    const { removing, removeProvider } = useVault();
    return (
        <table>
            <thead>
                <tr>
                    <th>Provider</th>
                    <th>Identity</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Refresh in</th>
                    <th>
                        <span className="sr-only">Actions</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {snapshot.credentials.map((entry) => (
                    <AccountRow
                        key={entry.id}
                        credential={entry}
                        removing={removing === entry.provider}
                        onRemove={() => void removeProvider(entry.provider)}
                    />
                ))}
            </tbody>
        </table>
    );
}
