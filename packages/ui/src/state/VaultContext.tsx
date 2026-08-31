import type { AsyncState, Provider, Snapshot, Usage } from "../api/types";
import { errorMessage, getProviders, getSnapshot, getUsage, logout } from "../api/client";
import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { createContext } from "preact";

interface VaultContextValue {
    snapshot: AsyncState<Snapshot>;
    providers: AsyncState<Provider[]>;
    usage: AsyncState<Usage>;
    reloadSnapshot: () => void;
    reloadProviders: () => void;
    reloadUsage: () => void;
    refreshVault: () => void;
    removeProvider: (provider: string) => Promise<void>;
    removing: string | null;
    removeError: string | null;
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined);

function useVaultData() {
    const [snapshot, setSnapshot] = useState<AsyncState<Snapshot>>({ phase: "loading" });
    const [usage, setUsage] = useState<AsyncState<Usage>>({ phase: "loading" });
    const [providers, setProviders] = useState<AsyncState<Provider[]>>({ phase: "loading" });

    const reloadSnapshot = useCallback(async () => {
        try {
            setSnapshot({ phase: "ready", data: await getSnapshot() });
        } catch (error) {
            setSnapshot({ phase: "error", message: errorMessage(error) });
        }
    }, []);

    const reloadProviders = useCallback(async () => {
        try {
            setProviders({ phase: "ready", data: await getProviders() });
        } catch (error) {
            setProviders({ phase: "error", message: errorMessage(error) });
        }
    }, []);

    const reloadUsage = useCallback(async () => {
        try {
            setUsage({ phase: "ready", data: await getUsage() });
        } catch (error) {
            setUsage({ phase: "error", message: errorMessage(error) });
        }
    }, []);

    const refreshVault = useCallback(() => {
        void reloadSnapshot();
        void reloadUsage();
    }, [reloadSnapshot, reloadUsage]);

    useEffect(() => {
        void reloadSnapshot();
        void reloadUsage();
        void reloadProviders();
    }, [reloadProviders, reloadSnapshot, reloadUsage]);

    return { snapshot, providers, usage, reloadSnapshot, reloadProviders, reloadUsage, refreshVault };
}

export function VaultProvider({ children }: { children: ComponentChildren }) {
    const { snapshot, providers, usage, reloadSnapshot, reloadProviders, reloadUsage, refreshVault } = useVaultData();
    const [removing, setRemoving] = useState<string | null>(null);
    const [removeError, setRemoveError] = useState<string | null>(null);

    const removeProvider = useCallback(
        async (provider: string) => {
            const confirmed = globalThis.confirm(`Remove all ${provider} credentials from the shared vault?`);
            if (!confirmed) {
                return;
            }
            setRemoving(provider);
            setRemoveError(null);
            try {
                await logout(provider);
                await Promise.all([reloadSnapshot(), reloadUsage()]);
            } catch (error) {
                setRemoveError(errorMessage(error));
            } finally {
                setRemoving(null);
            }
        },
        [reloadSnapshot, reloadUsage],
    );

    const value = useMemo<VaultContextValue>(
        () => ({
            snapshot,
            providers,
            usage,
            reloadSnapshot,
            reloadProviders,
            reloadUsage,
            refreshVault,
            removeProvider,
            removing,
            removeError,
        }),
        [
            snapshot,
            providers,
            usage,
            reloadSnapshot,
            reloadProviders,
            reloadUsage,
            refreshVault,
            removeProvider,
            removing,
            removeError,
        ],
    );

    return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
    const context = useContext(VaultContext);
    if (!context) {
        throw new Error("useVault must be used within a VaultProvider");
    }
    return context;
}
