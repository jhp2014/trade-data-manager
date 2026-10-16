// 떠 있는 판의 자리 계산 — 순수 함수(DOM 을 안 만진다. 재는 것은 useFitInViewport 가 한다).
// workbench ui/popover/place.ts 에서 옮겼다(트리거 판만 쓰므로 커서 판의 "밀어 덮기"는 뺐다).
//
// 두 단계로 나뉜다:
//   · decide   — 판을 **처음 열 때 한 번**: 위/아래, 왼/오른 정렬을 고른다.
//   · position — 그 결정을 고정한 채 좌표와 maxHeight 만 낸다(판이 자라도, 앵커가 스크롤로 움직여도).
// 결정을 고정하는 이유: 판에 줄이 늘 때마다 처음부터 다시 고르면 판이 커서 밑에서 반대편으로 휙 뒤집힌다.
// 자람은 남은 공간 안에서 maxHeight(내부 스크롤)로 흡수한다.

/** 뷰포트 좌표의 사각형. */
export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export interface Size {
    width: number;
    height: number;
}

export interface PlaceOpts {
    /** 선호 방향 — 앵커 아래(below)에 열지 위(above)에 열지. */
    side: "below" | "above";
    /** 가로 정렬 — start = 판 왼끝을 앵커 왼끝에, end = 판 오른끝을 앵커 오른끝에. */
    align: "start" | "end";
    /** 앵커와 판 사이 세로 간격. */
    gap: number;
}

/** 처음 열 때 고른 것. 이후 position 은 이걸 바꾸지 않는다. */
export interface Placement {
    v: "below" | "above";
    h: "start" | "end";
}

/** 판 좌표 — above 는 **아랫변 고정**(bottomLine)이라 판이 위로 자란다(그래야 앵커 쪽 모서리가 안 튄다). */
export interface Position {
    left: number;
    /** below: 윗변 y. */
    top?: number;
    /** above: 아랫변 y. */
    bottomLine?: number;
    maxHeight: number;
}

/** 화면 가장자리 여백. */
export const EDGE = 8;

const spaceBelow = (a: Rect, vp: Size, o: PlaceOpts): number => vp.height - EDGE - (a.bottom + o.gap);
const spaceAbove = (a: Rect, o: PlaceOpts): number => a.top - o.gap - EDGE;
const endLeft = (a: Rect, w: number): number => a.right - w;

export function decide(a: Rect, size: Size, vp: Size, o: PlaceOpts): Placement {
    const below = spaceBelow(a, vp, o);
    const above = spaceAbove(a, o);
    const fits = (side: "below" | "above"): boolean => size.height <= (side === "below" ? below : above);
    const other = o.side === "below" ? "above" : "below";
    // 선호 쪽에 들어가면 그쪽, 반대쪽에만 들어가면 반대쪽, 어디에도 안 들어가면 넓은 쪽(남는 높이는 내부 스크롤).
    const v = fits(o.side) ? o.side : fits(other) ? other : below >= above ? "below" : "above";

    const w = size.width;
    const fitsStart = a.left + w <= vp.width - EDGE;
    const fitsEnd = endLeft(a, w) >= EDGE;
    const pref = o.align;
    const h: Placement["h"] = (pref === "start" ? fitsStart : fitsEnd) ? pref
        : (pref === "start" ? fitsEnd : fitsStart) ? (pref === "start" ? "end" : "start")
        : pref; // 어느 쪽도 안 되면 선호 쪽에서 clamp 에 맡긴다
    return { v, h };
}

export function position(a: Rect, size: Size, vp: Size, o: PlaceOpts, p: Placement): Position {
    const raw = p.h === "start" ? a.left : endLeft(a, size.width);
    // 가로는 매번 clamp 만(폭이 바뀌거나 창이 줄면 안으로 들인다) — 정렬 결정은 안 바꾼다.
    const left = Math.max(EDGE, Math.min(raw, vp.width - EDGE - size.width));
    if (p.v === "below") return { left, top: a.bottom + o.gap, maxHeight: Math.max(0, spaceBelow(a, vp, o)) };
    return { left, bottomLine: a.top - o.gap, maxHeight: Math.max(0, spaceAbove(a, o)) };
}
