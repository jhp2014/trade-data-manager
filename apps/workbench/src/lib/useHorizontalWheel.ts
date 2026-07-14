import { useEffect, useRef } from "react";

// 가로 휠 스크롤 — 요소에 커서 두고 세로 휠 굴리면 가로로(넘칠 때만). market-eye 동작.
// enabled: 조건부 부착(예: 가설필터 가로모드) — 토글 시 effect 재실행으로 리스너를 새로 붙인다
// (마운트 한 번만 걸면 ref 미부착 상태로 등록을 놓침).
export function useHorizontalWheel<T extends HTMLElement>(enabled = true): React.RefObject<T> {
    const ref = useRef<T>(null);
    useEffect(() => {
        const el = ref.current;
        if (!enabled || !el) return;
        const onWheel = (e: WheelEvent): void => {
            if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [enabled]);
    return ref;
}
