import { AccountsTable } from "./AccountsTable";
import { AsyncSection } from "./AsyncSection";
import { useVault } from "../state/VaultContext";

export function Accounts() {
    const { snapshot, removeError, reloadSnapshot } = useVault();
    return (
        <>
            {removeError && (
                <p className="notice notice--error" role="alert">
                    Account removal failed: {removeError}
                </p>
            )}
            <div className="table-frame">
                <AsyncSection
                    state={snapshot}
                    loading={<output className="notice">Reading the shared vault…</output>}
                    error={
                        <div className="state-block">
                            <p className="notice notice--error" role="alert">
                                Accounts could not be loaded: {snapshot.phase === "error" ? snapshot.message : ""}
                            </p>
                            <button className="button button--secondary" type="button" onClick={reloadSnapshot}>
                                Try again
                            </button>
                        </div>
                    }
                    empty={(data) => data.credentials.length === 0}
                    emptyContent={
                        <div className="empty-state">
                            <p className="label">Vault empty</p>
                            <h3>Connect your first provider</h3>
                            <p>Credentials added here are available to omp clients using this broker.</p>
                        </div>
                    }
                >
                    {(data) => <AccountsTable snapshot={data} />}
                </AsyncSection>
            </div>
        </>
    );
}
