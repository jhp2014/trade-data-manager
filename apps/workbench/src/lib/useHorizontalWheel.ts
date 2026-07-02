import { useEffect, useRef } from "react";

// 가로 휠 스크롤 — 요소에 커서 두고 세로 휠 굴리면 가로로(넘칠 때만). market-eye 동작.
export function useHorizontalWheel<T extends HTMLElement>(): React.RefObject<T> {
    const ref = useRef<T>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onWheel = (e: WheelEvent): void => {
            if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);
    return ref;
}
