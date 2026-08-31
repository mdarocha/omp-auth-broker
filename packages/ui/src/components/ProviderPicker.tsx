import { AsyncSection } from "./AsyncSection";
import { useLogin } from "../state/LoginContext";
import { useVault } from "../state/VaultContext";

export function ProviderPicker() {
    const { providers, reloadProviders } = useVault();
    const { beginLogin } = useLogin();

    return (
        <div className="provider-picker" id="provider-picker">
            <div className="provider-picker__head">
                <h3>Choose a provider</h3>
                <p>Start its authorization flow in this browser.</p>
            </div>
            <AsyncSection
                state={providers}
                loading={<output className="notice">Loading providers…</output>}
                error={
                    <p className="notice notice--error" role="alert">
                        Providers could not be loaded: {providers.phase === "error" ? providers.message : ""}
                        <button className="text-button" type="button" onClick={reloadProviders}>
                            Try again
                        </button>
                    </p>
                }
                empty={(data) => data.length === 0}
                emptyContent={<output className="notice">No login providers are available.</output>}
            >
                {(data) => (
                    <ul className="provider-list">
                        {data.map((provider) => (
                            <li key={provider.id}>
                                <button type="button" onClick={() => void beginLogin(provider)}>
                                    <span>{provider.name}</span>
                                    <span className="provider-list__meta">
                                        {provider.pasteCode ? "Paste code" : provider.id}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </AsyncSection>
        </div>
    );
}
