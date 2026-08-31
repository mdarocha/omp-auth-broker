import type { AuthStorage, SqliteAuthCredentialStore } from "@oh-my-pi/pi-ai";
import type { LoginSessions } from "./login-session";

export interface ControlContext {
    brokerBase: string;
    sessions: LoginSessions;
    storage: AuthStorage;
    store: SqliteAuthCredentialStore;
}
