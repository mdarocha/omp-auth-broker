import { useEffect, useState } from "preact/hooks";
import { getVersion } from "../api/client";

export function BuildInfo() {
    const [commit, setCommit] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getVersion().then(
            (version) => {
                if (!cancelled) {
                    setCommit(version.commit);
                }
            },
            () => {
                // Build info is decorative; ignore failures.
            },
        );
        return () => {
            cancelled = true;
        };
    }, []);

    if (!commit) {
        return null;
    }

    return <span className="build-info">Build {commit}</span>;
}
