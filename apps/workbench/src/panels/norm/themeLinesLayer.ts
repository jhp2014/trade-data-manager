// 테마 선의 **표시목록 빌더** — 분당 종가 경로(%p 평행이동, 세로 간격 보존).
//
// 골격보다 **먼저** 그린다: 이건 배경이고 주인공은 내 골격이다.
// 기본은 무채색 흐림 — 흐린 채색은 색이 아니다(알파가 낮으면 hue 차이가 안 읽힌다).
// 굵기를 켜면 거래대금 램프로 살아난다. **타점 이후(x ≥ 0)는 앵커 선과 같은 문장** —
// 폴리라인은 점선, 런은 옅게(굵기와 안 싸우게).
//
// 손짓(호버·클릭)은 여기 없다 — 투명 히트라인이 따로 진다(ThemeHit). 선은 순수 그림이라
// 캔버스로 옮겨도 조작이 안 바뀐다는 규약이 그 분리에서 나온다.
import { clipToX, decimate, splitAtX } from "./overlay.js";
import type { AmountRun } from "../canvas/amountRuns.js";
import { runWidth } from "./amountLayer.js";
import type { ThemeOverlay } from "./useThemeOverlay.js";
import { compact, type DrawGroup, type DrawLayer, type DrawOp, type Pt } from "../canvas/drawList.js";

const THEME_STROKE = "var(--text-tertiary)";

export interface ThemeLinesParams {
    overlay: ThemeOverlay;
    /** 거래대금 런 — 있으면 선 굵기가 대금을 진다(색은 여전히 무채색). */
    runs: ReadonlyMap<string, AmountRun[]> | null;
    hovered: ReadonlySet<string> | null;
    /** 값 공간 점들 → 화면 좌표 평평한 배열. 화면 구간 자르기·솎기까지 여기 들어 있다. */
    project: (points: readonly Pt[], step: number) => number[];
    /** 보이는 x 구간 — 화면 밖 런은 아예 안 그린다(하루치 런은 대부분 창 밖이다). */
    clip: { from: number; to: number } | null;
    lineStep: number;
}

export function themeLinesLayer({ overlay, runs, hovered, project, clip, lineStep }: ThemeLinesParams): DrawLayer {
    const groups: DrawGroup[] = [];

    for (const l of overlay.lines) {
        const lit = hovered?.has(l.code) ?? false;
        const r = runs?.get(l.code);

        if (!r) {
            const { past, future } = splitAtX(decimate(clip ? clipToX(l.points, clip.from, clip.to) : l.points, lineStep), 0);
            const width = lit ? 2 : 1;
            const ops: DrawOp[] = [];
            if (past.length >= 2) ops.push({ op: "polyline", pts: project(past, 1), stroke: THEME_STROKE, width, join: "round" });
            if (future.length >= 2) ops.push({ op: "polyline", pts: project(future, 1), stroke: THEME_STROKE, width, join: "round", dash: "4 4" });
            groups.push({ opacity: lit ? 0.9 : hovered ? 0.2 : 0.45, ops });
            continue;
        }

        // 선은 무채색, **굵기가 거래대금**이다. 짚은 것만 또렷해지고 굵기 배수도 커진다.
        // 테마 배수를 앵커보다 낮게 잡아 30선이 굵어져도 주인공이 안 묻힌다.
        const ops: DrawOp[] = [];
        for (const run of r) {
            if (clip && !(run.points[run.points.length - 1].x >= clip.from && run.points[0].x <= clip.to)) continue;
            ops.push({
                op: "polyline",
                pts: project(run.points, lineStep),
                stroke: THEME_STROKE,
                width: runWidth(run.level, lit ? 0.9 : 0.7),
                cap: "round",
                join: "round",
                opacity: run.points[0].x >= 0 ? 0.4 : 1,
            });
        }
        groups.push({ opacity: lit ? 1 : hovered ? 0.25 : 0.55, ops });
    }

    return { name: "theme-lines", groups: compact(groups) };
}
