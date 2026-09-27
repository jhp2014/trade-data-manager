// 호버카드·툴팁의 자리 — 판(FloatingSurface)과 같은 계산(place.ts)을 쓰되 판이 아닌 것용.
// 판과 다른 점: 닫힘 규칙이 없고(마우스가 떠나면 사라진다), 커서를 따라 움직이므로 방향 결정을
// 고정하지 않는다(매번 새로 고른다 — 자라는 편집 중이 아니라 튐이 문제 되지 않는다).
import { useLayoutEffect, useState, type RefObject } from "react";
import { decide, position, type PlaceOpts, type Rect } from "./place.js";

/** 첫 렌더는 null — 호출자는 그동안 visibility:hidden 으로 그려 크기를 재게 한다. */
export function usePlacedTooltip(ref: RefObject<HTMLElement | null>, anchor: Rect | null, opts: PlaceOpts): { left: number; top: number } | null {
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!anchor || !el) { setPos(null); return; }
        const size = { width: el.offsetWidth, height: el.offsetHeight };
        const vp = { width: window.innerWidth, height: window.innerHeight };
        const r = position(anchor, size, vp, opts, decide(anchor, size, vp, opts));
        const left = Math.round(r.left);
        const top = Math.round(r.top ?? (r.bottomLine ?? 0) - size.height);
        setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
        // opts 는 호출부 상수 — 앵커 좌표만 본다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref, anchor?.left, anchor?.top, anchor?.right, anchor?.bottom]);
    return anchor ? pos : null;
}
