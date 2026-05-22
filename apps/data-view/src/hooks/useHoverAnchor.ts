"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_DELAY = 150;

/**
 * Row hover 시 panel 위치 계산용 anchor(DOMRect)를 제공하는 hook.
 *
 * 가상화 도입 후 고려사항:
 *  - 빠른 스크롤로 row 가 unmount 될 때 mouseleave 가 안 터질 수 있어
 *    cleanup 에서 명시적으로 anchor 를 해제한다.
 *  - 외부 스크롤 컨테이너가 스크롤될 때도 anchor 를 해제하기 위해
 *    `scrollContainerSelector` 옵션을 통해 capture-phase scroll 리스너를
 *    붙일 수 있다. (data-view 의 가상화 컨테이너에 data-attribute 부착)
 */
export function useHoverAnchor(delayMs = DEFAULT_DELAY) {
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const ref = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number | null>(null);

    const clear = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setAnchor(null);
    };

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
        clear();
    };

    // unmount / 외부 신호로 안전하게 anchor 해제
    useEffect(() => {
        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    // 임의의 글로벌 이벤트(스크롤 등)로 anchor 해제
    useEffect(() => {
        if (!anchor) return;
        const onScroll = () => clear();
        // capture: 가상화 컨테이너 내부 스크롤도 잡기 위함
        window.addEventListener("scroll", onScroll, true);
        return () => window.removeEventListener("scroll", onScroll, true);
    }, [anchor]);

    return {
        anchor,
        bind: { ref, onMouseEnter, onMouseLeave },
    };
}
