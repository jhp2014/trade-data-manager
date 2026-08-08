// Ctrl+드래그 사각 선택 — **사각형 역학만** 소유한다(시작·이동·끝·클릭 오인 방지·리스너 수명).
// 무엇을 담을지(라벨·마커 히트테스트)는 onSelect 콜백의 몫이고, 판정 재료(scales·lines)가 렌더마다
// 바뀌므로 ref 로 mouseup 시점의 **최신** 콜백을 부른다 — 드래그 중 리사이즈로 라벨이 움직여도
// 화면에 보이는 지금 자리로 판정한다(시작 시점 스냅숏으로 판정하면 보이는 것과 담기는 게 어긋난다).
// d3-zoom 의 기본 filter 가 ctrl+mousedown 을 무시하므로 이 이벤트는 마퀴 것이다(패널 규약).
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface MarqueeRect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** 클릭 오인 방지 임계(px) — 두 변 다 이보다 작으면 드래그가 아니라 클릭이다. */
const MIN_DRAG_PX = 4;

export function useMarquee(
    wrapRef: RefObject<HTMLDivElement | null>,
    enabled: boolean,
    onSelect: (rect: MarqueeRect) => void,
): { marquee: MarqueeRect | null; onMouseDown: (e: React.MouseEvent) => void } {
    const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
    const marqueeRef = useRef<MarqueeRect | null>(null);
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    // 진행 중 window 리스너의 해제자 — 드래그 도중 패널이 언마운트돼도(도킹 패널 닫기) 리스너가 안 남는다.
    const cleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => () => cleanupRef.current?.(), []);

    const onMouseDown = useCallback((e: React.MouseEvent): void => {
        if (!(e.ctrlKey || e.metaKey) || !wrapRef.current || !enabled) return;
        const wr = wrapRef.current.getBoundingClientRect();
        const start: MarqueeRect = { x0: e.clientX - wr.left, y0: e.clientY - wr.top, x1: e.clientX - wr.left, y1: e.clientY - wr.top };
        setMarquee(start);
        marqueeRef.current = start;
        const move = (me: MouseEvent): void => {
            const cur = marqueeRef.current;
            if (!cur) return;
            const next = { ...cur, x1: me.clientX - wr.left, y1: me.clientY - wr.top };
            marqueeRef.current = next;
            setMarquee(next);
        };
        const cleanup = (): void => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            cleanupRef.current = null;
        };
        const up = (): void => {
            cleanup();
            const rect = marqueeRef.current;
            marqueeRef.current = null;
            setMarquee(null);
            if (!rect || (Math.abs(rect.x1 - rect.x0) < MIN_DRAG_PX && Math.abs(rect.y1 - rect.y0) < MIN_DRAG_PX)) return;
            onSelectRef.current(rect);
        };
        cleanupRef.current = cleanup;
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        e.preventDefault();
    }, [wrapRef, enabled]);

    return { marquee, onMouseDown };
}
