import { useEffect } from "react";

interface Options {
    enabled?: boolean;
    ignoreInForm?: boolean;
}

export function useShortcut(
    key: string | string[],
    handler: (e: KeyboardEvent) => void,
    { enabled = true, ignoreInForm = true }: Options = {},
): void {
    useEffect(() => {
        if (!enabled) return;

        const keys = Array.isArray(key) ? key : [key];

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing) return;
            if (ignoreInForm) {
                const t = e.target as HTMLElement;
                if (
                    t.tagName === "INPUT" ||
                    t.tagName === "TEXTAREA" ||
                    t.tagName === "SELECT" ||
                    t.isContentEditable
                ) return;
            }
            if (keys.includes(e.key)) handler(e);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [key, handler, enabled, ignoreInForm]);
}
