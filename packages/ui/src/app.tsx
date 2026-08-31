import "./app.css";
import { LoginProvider, useLogin } from "./state/LoginContext";
import { useRef, useState } from "preact/hooks";
import { Accounts } from "./components/Accounts";
import { LoginFlow } from "./components/LoginFlow";
import { ProviderPicker } from "./components/ProviderPicker";
import { render } from "preact";
import { Usage } from "./components/Usage";
import { VaultProvider } from "./state/VaultContext";

function AppShell() {
    const [pickerOpen, setPickerOpen] = useState(false);
    const { login } = useLogin();
    const previousSessionIdRef = useRef<string>("");

    if (login && login.state === "pending" && login.sessionId !== previousSessionIdRef.current) {
        previousSessionIdRef.current = login.sessionId;
        setPickerOpen(false);
    }

    return (
        <div className="shell">
            <header className="masthead">
                <div>
                    <p className="eyebrow">Shared credential plane</p>
                    <h1>
                        auth<span aria-hidden="true">/</span>broker
                    </h1>
                </div>
                <div className="connection" aria-label="Connection security">
                    <span className="connection__mark" aria-hidden="true" />
                    <span>Network gated</span>
                </div>
            </header>

            <main>
                <section className="section" aria-labelledby="accounts-heading">
                    <div className="section__head">
                        <div>
                            <p className="section__index">01 / Vault</p>
                            <h2 id="accounts-heading">Accounts</h2>
                        </div>
                        <button
                            className="button button--primary"
                            type="button"
                            aria-expanded={pickerOpen}
                            aria-controls="provider-picker"
                            onClick={() => setPickerOpen((value) => !value)}
                        >
                            {pickerOpen ? "Close" : "Add provider"}
                        </button>
                    </div>

                    {pickerOpen && <ProviderPicker />}
                    <LoginFlow />
                    <Accounts />
                </section>

                <Usage />
            </main>
            <footer>
                <span>omp auth broker</span>
                <span>Shared vault · No application authentication</span>
            </footer>
        </div>
    );
}

function App() {
    return (
        <VaultProvider>
            <LoginProvider>
                <AppShell />
            </LoginProvider>
        </VaultProvider>
    );
}

render(<App />, document.getElementById("app")!);
