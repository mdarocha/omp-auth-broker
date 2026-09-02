import { AsyncSection } from "./AsyncSection";
import { ProviderIcon } from "./ProviderIcon";
import { useLogin } from "../state/LoginContext";
import { useVault } from "../state/VaultContext";

export function ProviderPicker() {
    const { providers, reloadProviders } = useVault();
    const { beginLogin } = useLogin();

    return (
        <div className="provider-picker" id="provider-picker">
            <h3>Choose a provider</h3>
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
                                    <ProviderIcon providerId={provider.id} />
                                    <span>{provider.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </AsyncSection>
        </div>
    );
}
