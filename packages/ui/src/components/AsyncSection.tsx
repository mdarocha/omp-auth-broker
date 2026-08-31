import type { AsyncState } from "../api/types";
import type { ComponentChildren } from "preact";

interface AsyncSectionProps<T> {
    state: AsyncState<T>;
    loading: ComponentChildren;
    error: ComponentChildren;
    empty: (data: T) => boolean;
    emptyContent: ComponentChildren;
    children: (data: T) => ComponentChildren;
}

export function AsyncSection<T>({ state, loading, error, empty, emptyContent, children }: AsyncSectionProps<T>) {
    if (state.phase === "loading") {
        return loading;
    }
    if (state.phase === "error") {
        return error;
    }
    if (empty(state.data)) {
        return emptyContent;
    }
    return children(state.data);
}
