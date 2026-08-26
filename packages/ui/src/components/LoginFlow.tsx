import { h } from "preact";
import htm from "htm";
import type { LoginSession } from "../app";

const html = htm.bind(h);

export type LoginFlowProps = {
    login: LoginSession;
    code: string;
    codeBusy: boolean;
    codeError: string | null;
    onCodeChange: (code: string) => void;
    onSubmitCode: (event: Event) => void;
    onDismiss: () => void;
};

export function LoginFlow({ login, code, codeBusy, codeError, onCodeChange, onSubmitCode, onDismiss }: LoginFlowProps) {
    return html`
        <aside class=${`login-flow login-flow--${login.state}`} aria-labelledby="login-heading">
            <div class="login-flow__head">
                <div>
                    <p class="label">Authorization</p>
                    <h3 id="login-heading">Connect ${login.provider.name}</h3>
                </div>
                <button class="icon-button" type="button" aria-label="Dismiss authorization panel" onClick=${onDismiss}>
                    ×
                </button>
            </div>
            ${
                login.state === "pending" &&
                html`
                    ${login.url && html`<a class="auth-link" href=${login.url} target="_blank" rel="noreferrer">Open authorization ↗</a>`}
                    ${login.instructions && html`<pre class="instructions">${login.instructions}</pre>`}
                    <p class="notice" role="status">Waiting for ${login.provider.name}… Keep this page open.</p>
                    ${
                        login.needsCode &&
                        html`
                            <form class="code-form" onSubmit=${onSubmitCode}>
                                <label for="authorization-code">Authorization code</label>
                                <div class="code-form__controls">
                                    <input
                                        id="authorization-code"
                                        name="code"
                                        value=${code}
                                        onInput=${(event: InputEvent) => onCodeChange((event.currentTarget as HTMLInputElement).value)}
                                        autocomplete="one-time-code"
                                        spellcheck=${false}
                                        required
                                    />
                                    <button
                                        class="button button--secondary"
                                        type="submit"
                                        disabled=${codeBusy || !code.trim()}
                                    >
                                        ${codeBusy ? "Sending…" : "Send code"}
                                    </button>
                                </div>
                                ${codeError && html`<p class="notice notice--error" role="alert">Code was not accepted: ${codeError}</p>`}
                            </form>
                        `
                    }
                `
            }
            ${login.state === "done" && html`<p class="notice notice--success" role="status">${login.provider.name} is connected. The vault has been refreshed.</p>`}
            ${login.state === "error" && html`<p class="notice notice--error" role="alert">Login failed: ${login.message || "The provider ended the authorization flow."}</p>`}
        </aside>
    `;
}
