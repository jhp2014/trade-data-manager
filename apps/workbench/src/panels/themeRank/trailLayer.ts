// 꼬리 층(순수) — 그려진 점(시선·동료)마다 과거 오프셋 시점들의 자리를 폴리라인으로 잇는다.
// 산점 아래에 깔린다(점이 주인공, 꼬리는 맥락).
//
// 시점은 고정 간격이 아니라 **사용자 오프셋**(settingsSlice.themeTrailOffsets, 상한은 그 슬라이스가 잰다)이다 —
// 분당 전부 이으면 서수 지그재그로 스파게티가 된다는 판단(2026-09-09 논의). 평면에 시간 글자는 없다 —
// 흐림 계단이 곧 순서다(과거일수록 흐리고 가늘고 작다).
//
// 결손은 결손: 꼭짓점이 null(그 분 서수 없음·장 시작 전)이면 점도 선분도 그리지 않는다 — 이웃끼리
// 건너 잇지도 않는다(없는 경로를 지어내는 셈이라).
import type { DrawGroup, DrawLayer, DrawOp } from "../canvas/drawList.js";

export interface TrailPoint {
    rate: number;
    amount: number;
}

export interface Trail {
    color: string;
    /** 렌즈 밖 동료 — 산점의 DIM 과 같은 배율로 존재감만 낮춘다. */
    dim: boolean;
    /** 과거(오래된 것부터) 꼭짓점들 + 마지막 = 머리(지금 분, 산점의 점 자리). null = 그 분 결손. */
    pts: readonly (TrailPoint | null)[];
}

export interface TrailScales {
    x(ord: number): number;
    y(ord: number): number;
}

/** 렌즈 밖 동료 흐리기 — scatterLayer 의 DIM 과 같은 값(꼬리만 진하면 층이 어긋나 보인다). */
const DIM = 0.3;

/** 계단 i(0=가장 과거)…n-1(머리 직전) → 진하기·굵기·꼭짓점 반지름. 마지막 계단이 가장 진하다. */
const alphaOf = (i: number, n: number): number => 0.2 + 0.6 * ((i + 1) / n);
const widthOf = (i: number, n: number): number => 1.2 + 0.8 * ((i + 1) / n);
const radiusOf = (i: number, n: number): number => 1.6 + ((i + 1) / n);

export function trailLayer({ trails, scales }: { trails: readonly Trail[]; scales: TrailScales }): DrawLayer {
    const ops: DrawOp[] = [];
    for (const t of trails) {
        const n = t.pts.length - 1; // 계단 수 = 선분 수(꼭짓점 → 다음)
        if (n < 1) continue;
        const mul = t.dim ? DIM : 1;
        for (let i = 0; i < n; i++) {
            const a = t.pts[i];
            const b = t.pts[i + 1];
            if (a) {
                ops.push({ op: "circle", cx: scales.x(a.amount), cy: scales.y(a.rate), r: radiusOf(i, n), fill: t.color, opacity: alphaOf(i, n) * mul });
            }
            if (a && b) {
                ops.push({
                    op: "line",
                    x1: scales.x(a.amount), y1: scales.y(a.rate),
                    x2: scales.x(b.amount), y2: scales.y(b.rate),
                    stroke: t.color, width: widthOf(i, n), opacity: alphaOf(i, n) * mul,
                });
            }
        }
    }
    const groups: DrawGroup[] = ops.length > 0 ? [{ opacity: 1, ops }] : [];
    return { name: "rank-trails", groups };
}
