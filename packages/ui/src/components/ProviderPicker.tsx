import { h } from "preact";
import htm from "htm";
import type { AsyncState, Provider } from "../app";

const html = htm.bind(h);

export type ProviderPickerProps = {
    providers: AsyncState<Provider[]>;
    loginBusy: string | null;
    onRetry: () => void;
    onSelect: (provider: Provider) => void;
};

export function ProviderPicker({ providers, loginBusy, onRetry, onSelect }: ProviderPickerProps) {
    return html`
        <div class="provider-picker" id="provider-picker">
            <div class="provider-picker__head">
                <h3>Choose a provider</h3>
                <p>Start its authorization flow in this browser.</p>
            </div>
            ${providers.phase === "loading" && html`<p class="notice" role="status">Loading providers…</p>`}
            ${
                providers.phase === "error" &&
                html`
                    <p class="notice notice--error" role="alert">
                        Providers could not be loaded: ${providers.message}
                        <button class="text-button" type="button" onClick=${onRetry}>Try again</button>
                    </p>
                `
            }
            ${providers.phase === "ready" && providers.data.length === 0 && html`<p class="notice" role="status">No login providers are available.</p>`}
            ${
                providers.phase === "ready" &&
                providers.data.length > 0 &&
                html`
                    <ul class="provider-list">
                        ${providers.data.map(
                            (provider) => html`
                                <li key=${provider.id}>
                                    <button
                                        type="button"
                                        onClick=${() => onSelect(provider)}
                                        disabled=${loginBusy !== null}
                                    >
                                        <span>${provider.name}</span>
                                        <span class="provider-list__meta"
                                            >${loginBusy === provider.id ? "Starting…" : provider.pasteCode ? "Paste code" : provider.id}</span
                                        >
                                    </button>
                                </li>
                            `,
                        )}
                    </ul>
                `
            }
        </div>
    `;
}
