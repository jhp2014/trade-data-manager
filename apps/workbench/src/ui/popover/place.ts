// 떠 있는 판의 자리 계산 — 순수 함수(DOM 을 안 만진다. 재는 것은 useFitInViewport 가 한다).
//
// 두 단계로 나뉜다:
//   · decide   — 판을 **처음 열 때 한 번**: 위/아래, 왼/오른 정렬을 고른다.
//   · position — 그 결정을 고정한 채 좌표와 maxHeight 만 낸다(판이 자라도, 앵커가 스크롤로 움직여도).
// 결정을 고정하는 이유: 편집기에 줄이 늘 때마다 처음부터 다시 고르면 판이 커서 밑에서 반대편으로
// **휙 뒤집힌다**. 자람은 남은 공간 안에서 maxHeight(내부 스크롤)로 흡수한다.

/** 뷰포트 좌표의 사각형. 점 앵커(커서)는 폭·높이 0 인 사각형이다. */
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
    /** 가로 정렬 — start = 판 왼끝을 앵커 왼끝(+shiftX)에, end = 판 오른끝을 앵커 오른끝(−shiftX)에. */
    align: "start" | "end";
    /** 앵커와 판 사이 세로 간격. */
    gap: number;
    /** start 정렬 기준 가로 비킴(end 는 거울). 커서 메뉴가 커서를 살짝 덮게 하려면 음수. */
    shiftX: number;
    /**
     * 위아래 어디에도 통째로 안 들어갈 때:
     *   · true  — 화면 안으로 밀어 앵커를 덮는다(커서 메뉴 — 커서를 덮는 건 무해, 스크롤보다 낫다).
     *   · false — 넓은 쪽에 열고 남는 높이만큼 내부 스크롤(트리거 판 — 트리거를 가리면 안 된다).
     */
    overlap: boolean;
}

/** 처음 열 때 고른 것. 이후 position 은 이걸 바꾸지 않는다. */
export interface Placement {
    v: "below" | "above" | "pinned";
    /** v === "pinned" 일 때 고정한 윗변. */
    pinnedTop?: number;
    h: "start" | "end";
}

/** 판 좌표 — above 는 **아랫변 고정**(bottomLine)이라 판이 위로 자란다(그래야 앵커 쪽 모서리가 안 튄다). */
export interface Position {
    left: number;
    /** below·pinned: 윗변 y. */
    top?: number;
    /** above: 아랫변 y. */
    bottomLine?: number;
    maxHeight: number;
}

/** 화면 가장자리 여백. */
export const EDGE = 8;

const spaceBelow = (a: Rect, vp: Size, o: PlaceOpts): number => vp.height - EDGE - (a.bottom + o.gap);
const spaceAbove = (a: Rect, o: PlaceOpts): number => a.top - o.gap - EDGE;
const startLeft = (a: Rect, o: PlaceOpts): number => a.left + o.shiftX;
const endLeft = (a: Rect, o: PlaceOpts, w: number): number => a.right - o.shiftX - w;

export function decide(a: Rect, size: Size, vp: Size, o: PlaceOpts): Placement {
    const below = spaceBelow(a, vp, o);
    const above = spaceAbove(a, o);
    const fitsBelow = size.height <= below;
    const fitsAbove = size.height <= above;
    let v: Placement["v"];
    let pinnedTop: number | undefined;
    if (o.side === "below" ? fitsBelow : fitsAbove) v = o.side;
    else if (o.side === "below" ? fitsAbove : fitsBelow) v = o.side === "below" ? "above" : "below";
    else if (o.overlap) {
        v = "pinned";
        // 선호 방향의 시작점에서 출발해 화면 안으로 민다. 화면보다 크면 윗변 여백에 붙이고 스크롤.
        const start = o.side === "below" ? a.bottom + o.gap : a.top - o.gap - size.height;
        pinnedTop = Math.max(EDGE, Math.min(start, vp.height - EDGE - size.height));
    } else v = below >= above ? "below" : "above";

    const w = size.width;
    const fitsStart = startLeft(a, o) + w <= vp.width - EDGE;
    const fitsEnd = endLeft(a, o, w) >= EDGE;
    const pref = o.align;
    const h: Placement["h"] = (pref === "start" ? fitsStart : fitsEnd) ? pref
        : (pref === "start" ? fitsEnd : fitsStart) ? (pref === "start" ? "end" : "start")
        : pref; // 어느 쪽도 안 되면 선호 쪽에서 clamp 에 맡긴다
    return { v, h, ...(pinnedTop !== undefined ? { pinnedTop } : {}) };
}

export function position(a: Rect, size: Size, vp: Size, o: PlaceOpts, p: Placement): Position {
    const raw = p.h === "start" ? startLeft(a, o) : endLeft(a, o, size.width);
    // 가로는 매번 clamp 만(폭이 바뀌거나 창이 줄면 안으로 들인다) — 정렬 결정은 안 바꾼다.
    const left = Math.max(EDGE, Math.min(raw, vp.width - EDGE - size.width));
    if (p.v === "below") return { left, top: a.bottom + o.gap, maxHeight: Math.max(0, spaceBelow(a, vp, o)) };
    if (p.v === "above") return { left, bottomLine: a.top - o.gap, maxHeight: Math.max(0, spaceAbove(a, o)) };
    const top = p.pinnedTop ?? EDGE;
    return { left, top, maxHeight: Math.max(0, vp.height - EDGE - top) };
}

/** 점 앵커 → 폭·높이 0 사각형. */
export const pointRect = (x: number, y: number): Rect => ({ left: x, top: y, right: x, bottom: y });
