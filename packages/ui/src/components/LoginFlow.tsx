import { useLogin } from "../state/LoginContext";

export function LoginFlow() {
    const { login, code, codeBusy, codeError, onCodeChange, onSubmitCode, dismissLogin } = useLogin();

    if (!login) {
        return null;
    }

    return (
        <aside className={`login-flow login-flow--${login.state}`} aria-labelledby="login-heading">
            <div className="login-flow__head">
                <div>
                    <p className="label">Authorization</p>
                    <h3 id="login-heading">Connect {login.provider.name}</h3>
                </div>
                <button
                    className="icon-button"
                    type="button"
                    aria-label="Dismiss authorization panel"
                    onClick={dismissLogin}
                >
                    ×
                </button>
            </div>
            {login.state === "pending" && (
                <>
                    {login.url && (
                        <a className="auth-link" href={login.url} target="_blank" rel="noreferrer">
                            Open authorization ↗
                        </a>
                    )}
                    {login.instructions && <pre className="instructions">{login.instructions}</pre>}
                    <output className="notice">Waiting for {login.provider.name}… Keep this page open.</output>
                    {login.needsCode && (
                        <form className="code-form" onSubmit={onSubmitCode}>
                            <label htmlFor="authorization-code">Authorization code</label>
                            <div className="code-form__controls">
                                <input
                                    id="authorization-code"
                                    name="code"
                                    value={code}
                                    onInput={(event) => onCodeChange(event.currentTarget.value)}
                                    autoComplete="one-time-code"
                                    spellcheck={false}
                                    required
                                />
                                <button
                                    className="button button--secondary"
                                    type="submit"
                                    disabled={codeBusy || !code.trim()}
                                >
                                    {codeBusy ? "Sending…" : "Send code"}
                                </button>
                            </div>
                            {codeError && (
                                <p className="notice notice--error" role="alert">
                                    Code was not accepted: {codeError}
                                </p>
                            )}
                        </form>
                    )}
                </>
            )}
            {login.state === "done" && (
                <output className="notice notice--success">
                    {login.provider.name} is connected. The vault has been refreshed.
                </output>
            )}
            {login.state === "error" && (
                <p className="notice notice--error" role="alert">
                    Login failed: {login.message || "The provider ended the authorization flow."}
                </p>
            )}
        </aside>
    );
}
