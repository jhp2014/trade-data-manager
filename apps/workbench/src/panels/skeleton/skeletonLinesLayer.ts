// 골격선의 **표시목록 빌더** — 이 패널의 주인공 층.
//
// 선은 순수 그림이다: 포인터를 안 받고, 손잡이는 라벨(LabelLayer)이 진다. 그래서 이 층을 통째로
// 캔버스로 옮겨도 조작이 하나도 안 바뀐다 — 그러라고 처음부터 갈라 놓은 것이다.
//
// ## 묶음이 둘로 갈리는 이유 — 겹친 투명도는 **곱해진다**
// 예전엔 선 하나가 `<g opacity>` 하나였고 그 안에 피벗 좌표가 **또 `<g opacity>`** 로 들어 있었다.
// SVG 의 중첩 알파는 곱이므로, 평평한 목록으로 내리면서 그 곱을 손으로 지어 준다(readout 묶음).
// 폴리라인과 점은 한 묶음에 남긴다 — 점이 선 **위에** 앉으므로 따로 합성하면 겹친 데가 진해진다.
import { splitAtX, type AmountRun, type LineVisual, type OverlayLine } from "./skeletonOverlay.js";
import { runWidth } from "./amountLayer.js";
import { flatten, compact, type DrawGroup, type DrawLayer, type DrawOp, type Pt } from "./drawList.js";
import { fmtPct } from "../../lib/format.js";
import { timeOfMinutes } from "../../lib/date.js";
import { clamp } from "../../lib/num.js";

interface Box { left: number; top: number; width: number; height: number }
interface Scales { x: (v: number) => number; y: (v: number) => number }

const HALO = { color: "var(--bg-primary)", width: 3.5 };

export interface SkeletonLinesParams {
    lines: readonly OverlayLine[];
    scales: Scales;
    box: Box;
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
    /** 점 예산 안이면 모든 선에 피벗 점을 찍는다(밖이면 짚은 선만). */
    dotsForAll: boolean;
    pins: {
        shown: (key: string, i: number) => boolean;
        isPinned: (key: string, i: number) => boolean;
    };
    /** 축 단위가 붙은 x 표기(`3일`·`12분`) — 단위는 화면의 몫이라 이것만 주입받는다(%·시각·클램프는 lib 직수입). */
    fmtX: (x: number) => string;
}

export function skeletonLinesLayer(p: SkeletonLinesParams): DrawLayer {
    const { lines, scales, box, visualOf, opacity, isPointUnit, amounts, project, lineStep, dotsForAll, pins } = p;
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

        // ── 피벗 점 — 합성점(타점 종가)은 속 빈 원이라 손으로 찍은 점과 구분된다. 손이 올라간 점은 커진다.
        if (lit || dotsForAll) {
            for (let i = 0; i < s.points.length; i++) {
                const pt = s.points[i];
                const r = pins.shown(s.key, i) ? 5 : lit ? 3 : 2;
                const cx = scales.x(pt.x);
                const cy = scales.y(pt.y);
                ops.push(pt.synthetic
                    ? { op: "circle", cx, cy, r, fill: "var(--bg-primary)", stroke: color, width: 1.2 }
                    : { op: "circle", cx, cy, r, fill: color });
            }
        }

        groups.push({ opacity: lineOpacity, ops });

        // ── 피벗 좌표 — **짚은 점에만**(호버 미리보기 또는 클릭으로 붙잡은 것). 예전엔 조사 중인
        //    골격의 점 전부에 떴는데 분봉은 꺾인 점이 많아 화면이 숫자로 뒤덮였다(사용자 지적).
        //    **원점 좌표축에 내려 읽는다**(사용자 확정): 점 → 가로축으로 수직 점선, 점 → 세로축으로
        //    수평 점선, 값은 각 축의 발치에(기간은 x축 아래, %는 y축 옆). 점 옆에 두 값을 붙이면
        //    라벨끼리 겹치고 "이 점이 축의 어디냐"가 눈으로 안 잡힌다.
        //    축이 화면 밖으로 밀려나면(팬) 발치를 화면 가장자리로 잡는다 — 값을 못 읽는 것보단 낫다.
        //
        //    값은 뷰 공간 + **괄호에 절대값**(사용자 확정 — 분봉만): 평행이동량이 상수라
        //    벽시계 = x + t₀, 전일 종가 대비 % = y + baseRate 로 복원된다. 일봉엔 괄호가 없다
        //    (baseT 가 거래일 인덱스라 벽시계가 아니고, 앵커 대비 %가 그 자체로 값이다).
        for (let i = 0; i < s.points.length; i++) {
            const pt = s.points[i];
            // 원점 제외는 **일봉만** — 앵커 대비 (0,0)은 무의미하지만, 분봉의 원점은
            // 괄호(타점 시각·절대 등락률)가 실값이고 테마 값을 펴는 호버 자리다(사용자 확정).
            if (!pins.shown(s.key, i) || (s.kind !== "point" && pt.x === 0 && pt.y === 0)) continue;
            const px = scales.x(pt.x);
            const py = scales.y(pt.y);
            const ax = clamp(scales.x(0), box.left, box.left + box.width); // 세로축(%를 읽는 자리)
            const ay = clamp(scales.y(0), box.top, box.top + box.height); // 가로축(기간을 읽는 자리)
            const below = ay + 12 <= box.top + box.height; // x축 아래에 자리가 없으면 위로
            const leftSide = ax - box.left > 44; // y축 왼쪽에 자리가 없으면 오른쪽으로
            // 붙잡은 값은 계속 또렷하게, 스치는 미리보기는 한 단계 물러난다(붙잡았다는 게 보이게).
            const pin = pins.isPinned(s.key, i);
            const size = pin ? 11 : 10;
            const weight = pin ? 700 : 400;
            const guide = { stroke: color, width: pin ? 1.2 : 0.8, dash: "2 3", opacity: pin ? 0.9 : 0.55 } as const;
            groups.push({
                // 중첩 알파의 곱 — 예전 `<g opacity={lineOpacity}><g opacity={pin?1:0.75}>` 와 같은 값.
                opacity: lineOpacity * (pin ? 1 : 0.75),
                ops: [
                    { op: "line", x1: px, y1: py, x2: px, y2: ay, ...guide },
                    { op: "line", x1: px, y1: py, x2: ax, y2: py, ...guide },
                    {
                        op: "text", x: px, y: ay + (below ? 12 : -5), anchor: "middle",
                        text: `${p.fmtX(pt.x)}${s.kind === "point" ? ` (${timeOfMinutes(pt.x + s.baseT)})` : ""}`,
                        fill: color, size, weight, halo: HALO,
                    },
                    {
                        op: "text", x: ax + (leftSide ? -4 : 4), y: py - 3, anchor: leftSide ? "end" : "start",
                        text: `${fmtPct(pt.y)}${s.kind === "point" ? ` (${fmtPct(pt.y + s.baseRate)})` : ""}`,
                        fill: color, size, weight, halo: HALO,
                    },
                ],
            });
        }
    }

    return { name: "skeleton-lines", groups: compact(groups) };
}
