import "./app.css";
import { LoginProvider, useLogin } from "./state/LoginContext";
import { useEffect, useRef, useState } from "preact/hooks";
import { Accounts } from "./components/Accounts";
import { BuildInfo } from "./components/BuildInfo";
import { LoginFlow } from "./components/LoginFlow";
import { ProviderPicker } from "./components/ProviderPicker";
import { render } from "preact";
import { Usage } from "./components/Usage";
import { VaultProvider } from "./state/VaultContext";

function AppShell() {
    const [pickerOpen, setPickerOpen] = useState(false);
    const { login } = useLogin();
    const previousSessionIdRef = useRef<string>("");

    useEffect(() => {
        if (login && login.state === "pending" && login.sessionId !== previousSessionIdRef.current) {
            previousSessionIdRef.current = login.sessionId;
            setPickerOpen(false);
        }
    }, [login]);

    return (
        <div className="shell">
            <main>
                <section className="section" aria-labelledby="accounts-heading">
                    <div className="section__head">
                        <h2 id="accounts-heading">Accounts</h2>
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
                <BuildInfo />
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
