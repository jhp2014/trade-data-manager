// 판을 화면 안에 세우는 훅 — 실측 → 처음 한 번 방향 결정(place.decide) → 이후 좌표·maxHeight 만 갱신.
// workbench ui/popover/useFitInViewport.ts 에서 옮겼다(요소 앵커만 — 커서 판은 trade-lab 에 없다).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { decide, position, type PlaceOpts, type Placement, type Rect } from "./place.js";

interface Pos {
    x: number;
    y: number;
    /** true = 아랫변 고정(위로 연 판 — 위로 자란다). */
    fromBottom: boolean;
    maxHeight: number;
}

/**
 * 앵커는 매번 다시 잰다(스크롤로 움직이므로). 방향 결정은 판이 열려 있는 동안 그대로다.
 *
 * 좌표는 left/top 이 아니라 **(0,0) 고정 + transform** 으로 준다. fixed 박스의 shrink-to-fit 폭은
 * "뷰포트 폭 − left" 안에서 정해져서, left 로 오른쪽 끝에 세우면 내용이 그 좁은 폭으로 **다시
 * 줄바꿈**된다(잰 폭과 실제 폭이 갈린다). transform 은 레이아웃 폭에 영향이 없다.
 */
export function useFitInViewport({ ref, getAnchor, opts }: {
    ref: RefObject<HTMLElement | null>;
    getAnchor: () => Rect | null;
    opts: PlaceOpts;
}): CSSProperties {
    const [pos, setPos] = useState<Pos | null>(null);
    const anchorRef = useRef(getAnchor);
    anchorRef.current = getAnchor;
    const optsRef = useRef(opts);
    optsRef.current = opts;

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        let placement: Placement | null = null;
        const run = (): void => {
            const a = anchorRef.current();
            if (!a) return;
            const r = el.getBoundingClientRect();
            const vp = { width: window.innerWidth, height: window.innerHeight };
            const size = { width: r.width, height: r.height };
            // 첫 실측은 우리 maxHeight 가 안 걸린 상태라 원래 크기다.
            placement ??= decide(a, size, vp, optsRef.current);
            const p = position(a, size, vp, optsRef.current, placement);
            const next: Pos = p.bottomLine !== undefined
                ? { x: Math.round(p.left), y: Math.round(p.bottomLine - vp.height), fromBottom: true, maxHeight: Math.floor(p.maxHeight) }
                : { x: Math.round(p.left), y: Math.round(p.top ?? 0), fromBottom: false, maxHeight: Math.floor(p.maxHeight) };
            setPos((prev) => prev && prev.x === next.x && prev.y === next.y && prev.fromBottom === next.fromBottom && prev.maxHeight === next.maxHeight ? prev : next);
        };
        run();
        const ro = new ResizeObserver(run);
        ro.observe(el);
        window.addEventListener("resize", run);
        window.addEventListener("scroll", run, true);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", run);
            window.removeEventListener("scroll", run, true);
        };
    }, [ref]);

    if (!pos) {
        // 재기 전 한 번 — 안 보이게, 우리 maxHeight 없이(원래 크기를 재야 방향을 고른다).
        // ⚠ visibility:hidden 이 아니라 opacity:0 — 판 안 입력의 autoFocus 가 자리 잡기보다 먼저 돈다.
        //   Chrome 은 visibility:hidden 요소에 포커스를 안 준다.
        return { position: "fixed", left: 0, top: 0, opacity: 0, pointerEvents: "none" };
    }
    return {
        position: "fixed",
        left: 0,
        ...(pos.fromBottom ? { bottom: 0 } : { top: 0 }),
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        maxHeight: pos.maxHeight,
    };
}

/**
 * 앵커가 DOM 에서 떨어지면 닫는다 — dockview 탭 전환은 안 보이는 패널의 element 를 **떼어낸다**
 * (React 트리는 유지). body 로 portal 된 판은 그대로 남아 다른 패널 위에 겹친다(workbench 실측).
 * 탭 전환은 resize/scroll 어느 쪽도 안 울리므로 body subtree 의 childList 를 MutationObserver 로 듣는다.
 * dock 스토어를 구독하지 않는 이유: 패널 → 이 층 → dock → 카탈로그 → 패널로 import 순환이 된다.
 */
export function useCloseOnDetach(watchRef: RefObject<Element | null>, close: () => void): void {
    const closeRef = useRef(close);
    closeRef.current = close;
    useEffect(() => {
        const check = (): void => {
            const el = watchRef.current;
            if (el && !el.isConnected) closeRef.current();
        };
        check();
        const mo = new MutationObserver(check);
        mo.observe(document.body, { childList: true, subtree: true });
        return () => mo.disconnect();
    }, [watchRef]);
}
