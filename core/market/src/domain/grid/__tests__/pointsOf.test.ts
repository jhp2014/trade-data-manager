// pointsOf — 격자 리터럴로 읽기 층 Point 판정을 못 박는다(분봉·DB 0 — 격자 스키마 충분성의 증거).
import { describe, expect, it } from "vitest";
import type { GridNewHigh, GridPivot, PointGrid } from "../grid.js";
import { DEFAULT_POINT_DEFINITION, pointsOf } from "../points.js";

const nh = (min: number, high: number, eok: number, bull = true): GridNewHigh => ({
    min,
    high,
    tv: String(eok * 100_000_000),
    tvMax2: String(eok * 100_000_000),
    bull,
});
const hi = (min: number, price: number, confirmedMin: number | null): GridPivot => ({ kind: "high", min, price, confirmedMin, legAmount: "0" });
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: min + 1, legAmount: "0" });
const grid = (partial: Partial<PointGrid>): PointGrid => ({ base: 10000, touchMin: 550, pivots: [], newHighs: [], ...partial });

describe("pointsOf", () => {
    it("기준선 미터치(또는 기준선 없음) → Point 없음", () => {
        expect(pointsOf(grid({ touchMin: null, newHighs: [nh(560, 10050, 60)] }))).toEqual([]);
        expect(pointsOf(grid({ base: null, newHighs: [nh(560, 10050, 60)] }))).toEqual([]);
    });

    it("기본 흐름 — 기준선 돌파(50억 게이트) + 마디 갱신(30억 게이트)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toMatchObject({ kind: "breakout", ordinal: 0, min: 560, levelPrice: 10000 });
        expect(pts[1]).toMatchObject({ kind: "renewal", ordinal: 1, min: 600, levelPrice: 10300 });
    });

    it("게이트 상향 시 Point 는 목록 안에서 **이동**한다(사라지지 않는다)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35), nh(620, 10400, 60)],
        });
        expect(pointsOf(g).find((p) => p.kind === "renewal")?.min).toBe(600);
        const raised = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, renewalGateEok: 50 });
        expect(raised.find((p) => p.kind === "renewal")?.min).toBe(620);
    });

    it("제외 창 — 기본은 꺼짐(프리마켓도 Point 자격), 올리면 다음 자격 캔들로 이동", () => {
        const g = grid({ touchMin: 500, newHighs: [nh(505, 10100, 60), nh(560, 10150, 60)] });
        expect(pointsOf(g)[0]).toMatchObject({ kind: "breakout", min: 505 }); // 08:25 프리마켓 캔들이 그대로 Point
        const excluded = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, excludeUptoMin: 9 * 60 + 5 });
        expect(excluded[0]).toMatchObject({ kind: "breakout", min: 560 });
    });

    it("음봉은 게이트를 넘어도 Point 가 아니다", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60, false), nh(570, 10100, 60)] });
        expect(pointsOf(g)[0]).toMatchObject({ kind: "breakout", min: 570 });
    });

    it("한 캔들이 기준선+마디를 한 번에 넘으면 Point 는 하나(낮은 레벨 몫)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585)],
            newHighs: [nh(600, 10500, 60)],
        });
        const pts = pointsOf(g);
        expect(pts).toHaveLength(1);
        expect(pts[0]).toMatchObject({ kind: "breakout", min: 600, levelPrice: 10000 });
    });

    it("하락 중 낮은 고점은 레벨이 아니다(러닝 최고가였던 확정 고점만)", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(590, 10100), hi(600, 10200, 610)],
            newHighs: [nh(560, 10050, 60), nh(620, 10250, 60)],
        });
        // 10,200 마디는 러닝 최고가(10,300) 아래라 레벨이 아니고, 10,250 캔들은 아무것도 못 넘는다.
        expect(pointsOf(g)).toHaveLength(1);
    });

    it("미확정 마지막 마디는 넘을 대상이 아니다", () => {
        const g = grid({
            pivots: [hi(575, 10300, null)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35)],
        });
        expect(pointsOf(g).filter((p) => p.kind === "renewal")).toHaveLength(0);
    });

    it("mergeRisePct — 잔 마디를 병합하면 그 레벨의 Point 가 다음 유효 레벨로 넘어간다", () => {
        const g = grid({
            pivots: [lo(555, 10150), hi(570, 10250, 580), lo(585, 10180), hi(600, 10600, 610)],
            newHighs: [nh(550, 10050, 60), nh(590, 10280, 35), nh(620, 10700, 35)],
        });
        const loose = pointsOf(g);
        expect(loose.map((p) => [p.min, p.levelPrice])).toEqual([
            [550, 10000],
            [590, 10250],
            [620, 10600],
        ]);
        const merged = pointsOf(g, { ...DEFAULT_POINT_DEFINITION, mergeRisePct: 3 });
        // 10,250 마디(저점 10,150 대비 +0.99%)는 병합 — 10,280 캔들은 Point 가 못 되고 레벨은 10,600 뿐.
        expect(merged.map((p) => [p.min, p.levelPrice])).toEqual([
            [550, 10000],
            [620, 10600],
        ]);
    });
});
