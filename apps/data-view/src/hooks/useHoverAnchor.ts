"use client";

import { useRef, useState } from "react";

const DEFAULT_DELAY = 150;

export function useHoverAnchor(delayMs = DEFAULT_DELAY) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number | null>(null);

    const onMouseEnter = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (timerRef.current !== null) return;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            if (ref.current) setAnchor(ref.current.getBoundingClientRect());
        }, delayMs);
    };

    const onMouseLeave = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setAnchor(null);
    };

    return {
        anchor,
        bind: { ref, onMouseEnter, onMouseLeave },
    };
}
