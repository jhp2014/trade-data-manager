// 격자판 차트의 **보는 구간** 산수 — 순수. 손짓(휠 확대·드래그 이동·더블클릭 하루 전체·사슬로 확대)은 전부
// 이 함수들을 거친다(경계 처리가 손짓마다 따로면 어느 하나가 하루 밖으로 샌다).
import type { BreakoutChainSpan } from "@trade-data-manager/market/domain";
import type { GridSpan } from "./gridLayers.js";

/** 가장 좁은 창(봉) — 이보다 좁으면 봉 한두 개가 판을 채워 맥락이 없다. */
export const MIN_SPAN = 8;
/** 휠 한 칸의 확대 배율. */
export const WHEEL_ZOOM = 1.2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 창을 하루 `[0, n]` 안으로 — 폭은 [MIN_SPAN, n], 위치는 밀어 넣는다(폭을 깎지 않는다). */
export function clampSpan(sp: GridSpan, n: number): GridSpan {
    if (n <= 0) return { x0: 0, x1: 1 };
    const w = clamp(sp.x1 - sp.x0, Math.min(MIN_SPAN, n), n);
    const x0 = clamp(sp.x0, 0, n - w);
    return { x0, x1: x0 + w };
}

export const wholeSpan = (n: number): GridSpan => ({ x0: 0, x1: Math.max(1, n) });

/** `anchor`(인덱스, 실수) 를 제자리에 두고 폭을 `factor` 배로. */
export function zoomAt(sp: GridSpan, anchor: number, factor: number, n: number): GridSpan {
    return clampSpan({ x0: anchor - (anchor - sp.x0) * factor, x1: anchor + (sp.x1 - anchor) * factor }, n);
}

export const panBy = (sp: GridSpan, d: number, n: number): GridSpan => clampSpan({ x0: sp.x0 + d, x1: sp.x1 + d }, n);

/** 가운데를 `c` 로 — 폭은 그대로(길잡이 띠 클릭). */
export const centerAt = (sp: GridSpan, c: number, n: number): GridSpan => {
    const w = sp.x1 - sp.x0;
    return clampSpan({ x0: c - w / 2, x1: c + w / 2 }, n);
};

/** 사슬 하나로 확대 — 앞뒤로 사슬 길이의 30%(최소 5봉)를 붙여 들어오고 나가는 맥락을 남긴다. */
export function chainSpanOf(c: BreakoutChainSpan, n: number): GridSpan {
    const a = c.start;
    const b = c.end ?? n - 1; // 끝 봉(눌림)까지 보여야 "왜 끝났나"가 보인다
    const pad = Math.max(5, (b - a + 1) * 0.3);
    return clampSpan({ x0: a - pad, x1: b + 1 + pad }, n);
}

/** 처음 화면 — 포커스 봉이 사슬 안(시작~끝 봉)이면 그 사슬, 아니면 하루 전체. */
export function initialSpan(chains: readonly BreakoutChainSpan[], focusIdx: number | null, n: number): GridSpan {
    if (focusIdx !== null) {
        const c = chains.find((x) => focusIdx >= x.start && focusIdx <= (x.end ?? n - 1));
        if (c) return chainSpanOf(c, n);
    }
    return wholeSpan(n);
}
