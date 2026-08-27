// 테마 선 표시목록 — **조각을 가로지르는 폴리라인이 없다**는 것과 1점 조각의 점 표기.
//
// themeSkeleton.test 는 조각을 *뽑는* 규칙을, 여기는 조각을 *그리는* 층을 본다 — 조각을 이어 붙여
// 그리면(이탈이 지워지면) 뽑기가 아무리 맞아도 화면이 거짓말을 한다. dom 테스트는 점 수 비교라
// 간접 추정만 되므로, 순수 빌더를 직접 불러 op 단위로 단언한다.
import { describe, it, expect } from "vitest";
import { themeLinesLayer } from "../themeLinesLayer.js";
import type { ThemeOverlay } from "../useThemeOverlay.js";
import type { Pt } from "../../canvas/drawList.js";

/** 값 공간 그대로의 평평한 배열 — 좌표 변환 없이 x 가 op 에 남아 단언이 값으로 된다. */
const project = (points: readonly Pt[]): number[] => points.flatMap((p) => [p.x, p.y]);

const overlayOf = (segments: { x: number; y: number }[][]): ThemeOverlay => ({
    key: "k", t0: 0, baseRate: 0,
    lines: [{ code: "A", name: "A이름", segments }],
});

const build = (segments: { x: number; y: number }[][], hovered: ReadonlySet<string> | null = null) =>
    themeLinesLayer({ overlay: overlayOf(segments), runs: null, hovered, project, clip: null, lineStep: 1 });

describe("themeLinesLayer — 조각 단위 그리기", () => {
    // 과거(2점) + 1점 조각 + 미래(2점): 폴리라인 2개(각 2점) + 원 1개가 나와야 한다.
    const SEGS = [
        [{ x: -5, y: 0 }, { x: -4, y: 1 }],
        [{ x: -2, y: 2 }],
        [{ x: 1, y: 3 }, { x: 2, y: 4 }],
    ];

    it("조각마다 폴리라인 하나 — 조각 사이(갭)를 잇는 op 가 없다", () => {
        const ops = build(SEGS).groups[0].ops;
        const polys = ops.filter((o) => o.op === "polyline");
        expect(polys).toHaveLength(2);
        // 각 폴리라인은 자기 조각의 점만 든다(2점 = 평평한 배열 4칸) — 4칸보다 길면 갭을 삼킨 것이다.
        for (const p of polys) expect((p as { pts: readonly number[] }).pts).toHaveLength(4);
        // 미래 조각(x ≥ 0)은 점선 문장을 유지한다.
        expect(polys.filter((p) => (p as { dash?: string }).dash)).toHaveLength(1);
    });

    it("1점 조각은 원으로 남는다 — 1분 재적도 '떴다'는 사실이 보인다", () => {
        const ops = build(SEGS).groups[0].ops;
        const circles = ops.filter((o) => o.op === "circle");
        expect(circles).toHaveLength(1);
        expect((circles[0] as { cx: number }).cx).toBe(-2);
        expect((circles[0] as { r: number }).r).toBe(1.5);
    });

    it("짚으면 점도 커진다 — 선만 굵어지면 1분 멤버는 짚어도 티가 안 난다", () => {
        const ops = build(SEGS, new Set(["A"])).groups[0].ops;
        const circle = ops.find((o) => o.op === "circle") as { r: number };
        expect(circle.r).toBeGreaterThan(1.5);
    });
});
