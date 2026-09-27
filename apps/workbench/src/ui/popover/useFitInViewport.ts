// 판을 화면 안에 세우는 훅 — 실측 → 처음 한 번 방향 결정(place.decide) → 이후 좌표·maxHeight 만 갱신.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { decide, position, type PlaceOpts, type Placement, type Rect } from "./place.js";

interface Pos {
    key: string;
    x: number;
    y: number;
    /** true = 아랫변 고정(위로 연 판 — 위로 자란다). */
    fromBottom: boolean;
    maxHeight: number;
}

/**
 * @param getAnchor 앵커 사각형(뷰포트 좌표). 요소 앵커면 매번 다시 잰다(스크롤로 움직이므로).
 * @param key       앵커의 정체 — 바뀌면 방향을 **다시 고른다**(다른 칩을 우클릭했다). 같은 key 동안은
 *                  판이 자라도·앵커가 스크롤돼도 방향 결정은 그대로다.
 * @param cap       호출자가 원하는 최대 높이(예: "70vh") — 남은 공간과 둘 중 작은 쪽이 걸린다.
 * @param track     앵커가 스크롤로 움직이는가(요소 앵커). 점 앵커는 창 크기 변화만 듣는다.
 *
 * 좌표는 left/top 이 아니라 **(0,0) 고정 + transform** 으로 준다. fixed 박스의 shrink-to-fit 폭은
 * "뷰포트 폭 − left" 안에서 정해져서, left 로 오른쪽 끝에 세우면 내용이 그 좁은 폭으로 **다시
 * 줄바꿈**된다(잰 폭과 실제 폭이 갈린다). transform 은 레이아웃 폭에 영향이 없다.
 */
export function useFitInViewport({ ref, getAnchor, opts, key, cap, track = false }: {
    ref: RefObject<HTMLElement | null>;
    getAnchor: () => Rect | null;
    opts: PlaceOpts;
    key: string;
    cap?: number | string;
    track?: boolean;
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
            // 첫 실측은 우리 maxHeight 가 안 걸린 상태(pos 가 이 key 의 것이 아니다)라 원래 크기다.
            placement ??= decide(a, size, vp, optsRef.current);
            const p = position(a, size, vp, optsRef.current, placement);
            const next: Pos = p.bottomLine !== undefined
                ? { key, x: Math.round(p.left), y: Math.round(p.bottomLine - vp.height), fromBottom: true, maxHeight: Math.floor(p.maxHeight) }
                : { key, x: Math.round(p.left), y: Math.round(p.top ?? 0), fromBottom: false, maxHeight: Math.floor(p.maxHeight) };
            setPos((prev) => prev && prev.key === next.key && prev.x === next.x && prev.y === next.y
                && prev.fromBottom === next.fromBottom && prev.maxHeight === next.maxHeight ? prev : next);
        };
        run();
        const ro = new ResizeObserver(run);
        ro.observe(el);
        window.addEventListener("resize", run);
        if (track) window.addEventListener("scroll", run, true);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", run);
            if (track) window.removeEventListener("scroll", run, true);
        };
    }, [ref, key, track]);

    const live = pos && pos.key === key ? pos : null;
    if (!live) {
        // 재기 전 한 번 — 안 보이게, 우리 maxHeight 없이(원래 크기를 재야 방향을 고른다).
        return { position: "fixed", left: 0, top: 0, visibility: "hidden", ...(cap !== undefined ? { maxHeight: cap } : {}) };
    }
    const maxHeight = cap === undefined ? live.maxHeight
        : typeof cap === "number" ? Math.min(cap, live.maxHeight)
        : `min(${cap}, ${live.maxHeight}px)`;
    return {
        position: "fixed",
        left: 0,
        ...(live.fromBottom ? { bottom: 0 } : { top: 0 }),
        transform: `translate(${live.x}px, ${live.y}px)`,
        maxHeight,
    };
}

/**
 * 앵커가 DOM 에서 떨어지면 닫는다 — dockview 탭 전환은 비활성 패널의 element 를 **떼어낸다**
 * (React 트리는 유지). body 로 portal 된 판은 그대로 남아 다른 패널 위에 겹친다(2026-09-17
 * 실측 — 시장 단면 "축 ▾" 판 잔류). 점 앵커 판은 호출 자리에 둔 센티널을 본다.
 *
 * 판정은 rect 0×0 이 아니라 isConnected — 실측된 메커니즘이 탈착이고 이게 그 직접 판정이다.
 * 탭 전환은 resize/scroll 어느 쪽도 안 울리므로 body subtree childList 를 MutationObserver 로 듣는다
 * (콜백은 isConnected 한 줄 — 리렌더 폭주 없음). 기각: IntersectionObserver — Chrome 은 관찰 대상이
 * DOM 에서 **제거될 때 통지를 안 쏜다**(2026-09-17 실측). dock 스토어 구독 — store/dock 이 모듈
 * 최상위에서 panelCatalog 를 쓰고 패널들이 이 층을 쓰므로 import 순환(TDZ)이 된다. DOM 층에서 들으면
 * 탭 전환·그룹 드래그·플로팅 어떤 탈착이든 한 길로 잡힌다.
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
