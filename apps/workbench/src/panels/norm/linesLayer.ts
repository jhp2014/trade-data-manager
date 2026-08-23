// 정규화 선의 **표시목록 빌더** — 이 패널의 선 층(캔들 모드가 아닐 때의 주인공).
//
// 선은 순수 그림이다: 포인터를 안 받고, 손잡이는 라벨(LabelLayer)이 진다. 그래서 이 층을 통째로
// 캔버스로 옮겨도 조작이 하나도 안 바뀐다 — 그러라고 처음부터 갈라 놓은 것이다.
//
// ## 묶음이 둘로 갈리는 이유 — 겹친 투명도는 **곱해진다**
// 예전엔 선 하나가 `<g opacity>` 하나였고 그 안에 피벗 좌표가 **또 `<g opacity>`** 로 들어 있었다.
// SVG 의 중첩 알파는 곱이므로, 평평한 목록으로 내리면서 그 곱을 손으로 지어 준다(readout 묶음).
// 폴리라인과 점은 한 묶음에 남긴다 — 점이 선 **위에** 앉으므로 따로 합성하면 겹친 데가 진해진다.
import { splitAtX, type LineVisual, type OverlayLine } from "./overlay.js";
import type { AmountRun } from "../canvas/amountRuns.js";
import { runWidth } from "./amountLayer.js";
import { flatten, compact, type DrawGroup, type DrawLayer, type DrawOp, type Pt } from "../canvas/drawList.js";

interface Scales { x: (v: number) => number; y: (v: number) => number }

export interface NormLinesParams {
    lines: readonly OverlayLine[];
    scales: Scales;
    /** 테마 모드에선 선택선·짚은 것·뱃지 무리만 그린다(나머지는 라벨만 남는다). */
    lineShown: (key: string) => boolean;
    visualOf: (key: string) => { v: LineVisual; color: string };
    /** 역할별 진하기 — 선 수에 따라 화면이 정한 값들이라 규칙 층에 안 들인다. */
    opacity: { dimmed: number; recede: number; base: number };
    /** 타점 단위 선인가 — 그렇다면 원점(자기 시각) 이후가 **미래**다. */
    isPointUnit: boolean;
    /** 거래대금 굵기가 켜진 선 하나 — 선분마다 굵기가 달라 폴리라인이 여러 개가 된다. */
    amounts: { key: string; runs: readonly AmountRun[] } | null;
    /** 값 공간 점들 → 화면 좌표 평평한 배열(화면 구간 자르기·솎기 포함) — 런 전용. */
    project: (points: readonly Pt[], step: number) => number[];
    lineStep: number;
}

export function normLinesLayer(p: NormLinesParams): DrawLayer {
    const { lines, scales, visualOf, opacity, isPointUnit, amounts, project, lineStep } = p;
    const groups: DrawGroup[] = [];

    for (const s of lines) {
        if (!p.lineShown(s.key)) continue;
        const { v, color } = visualOf(s.key);
        const lit = v.role !== "base";
        // 진하기 = 역할이 정한다: 흐림(무리 밖) < 물러남(무리 안이지만 안 짚은 것) < 앞(짚은 것).
        const lineOpacity = v.dim ? opacity.dimmed : v.recede ? opacity.recede : lit ? 1 : opacity.base;

        const ops: DrawOp[] = [];

        // ── 선 자체 — 세 갈래다.
        const splitX = isPointUnit ? 0 : undefined;
        if (amounts && amounts.key === s.key) {
            // 거래대금이 붙은 선은 **선분마다 굵기가 달라** 한 폴리라인으로 못 그린다.
            // 색은 선 본연의 역할색(선택 파랑) 그대로 — 굵기만 거래대금이 정한다.
            // 미래 구간은 점선 대신 **옅게**(조각이 분 단위라 점선이 굵기와 싸워 둘 다 못 읽힌다).
            for (const r of amounts.runs) {
                ops.push({
                    op: "polyline", pts: project(r.points, lineStep),
                    stroke: color, width: runWidth(r.level, 1), cap: "round", join: "round",
                    opacity: splitX != null && r.points[0].x >= splitX ? 0.4 : 1,
                });
            }
        } else if (splitX == null) {
            ops.push({ op: "polyline", pts: flatten(s.points, scales.x, scales.y), stroke: color, width: v.width, join: "round" });
        } else {
            // 미래는 점선 — 타점 단위 선은 원점(자기 시각) 이후 전부.
            // 타점까지가 판단, 이후는 결과라는 문장이다.
            const { past, future } = splitAtX(s.points, splitX);
            if (past.length >= 2) ops.push({ op: "polyline", pts: flatten(past, scales.x, scales.y), stroke: color, width: v.width, join: "round" });
            if (future.length >= 2) ops.push({ op: "polyline", pts: flatten(future, scales.x, scales.y), stroke: color, width: v.width, join: "round", dash: "4 4" });
        }

        groups.push({ opacity: lineOpacity, ops });
    }

    return { name: "lines", groups: compact(groups) };
}
