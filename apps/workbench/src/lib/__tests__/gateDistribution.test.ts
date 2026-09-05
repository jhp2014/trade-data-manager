// 게이트 분포 빌더 — 격자 리터럴로 게이트별 분류·낟알·도메인을 못 박는다(등가 정리 자체는 core 테스트 몫).
import { describe, expect, it } from "vitest";
import { DEFAULT_POINT_DEFINITION, type GridNewHigh, type GridPivot, type PointGrid } from "@trade-data-manager/market/domain";
import { buildGateDistribution, gateValueAt } from "../gateDistribution.js";
import { valueToFrac } from "../computedAxis.js";

const DEF0 = { ...DEFAULT_POINT_DEFINITION, approachPct: 0 };
const EOK = 100_000_000;

const nh = (min: number, high: number, eok: number, bull = true, maxBefore = 0): GridNewHigh => ({
    min,
    open: bull ? high - 100 : high,
    high,
    low: high - 150,
    close: bull ? high : high - 100,
    tv: String(eok * EOK),
    cum: "0",
    maxBefore,
});
const hi = (min: number, price: number, confirmedMin: number | null, cross: number | null = null): GridPivot => ({
    kind: "high",
    min,
    price,
    confirmedMin,
    cum: "0",
    cross: cross === null ? null : { min: cross, tv: "0", cum: "0" },
});
const lo = (min: number, price: number): GridPivot => ({ kind: "low", min, price, confirmedMin: null, cum: "0", cross: null });
const grid = (partial: Partial<PointGrid>): PointGrid => ({
    base: 10000,
    touch: { min: 550, tv: "0", cum: "0" },
    pivots: [],
    newHighs: [],
    prevBase: null,
    prevBaseKrx: null,
    sessionHigh: { min: 550, price: 10000 },
    ...partial,
});
const byDate = (grids: PointGrid[]): Map<string, Map<string, PointGrid>> =>
    new Map([["2026-09-01", new Map(grids.map((g, i) => [`00000${i}`, g]))]]);

describe("buildGateDistribution", () => {
    it("돌파(레벨 0)/재돌파(레벨 ≥1)로 갈라 담고, 도메인은 두 줄 합집합의 [min, max]", () => {
        const g = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(560, 10050, 60), nh(600, 10350, 35), nh(620, 10400, 45)],
        });
        const d = buildGateDistribution(byDate([g]), DEF0);
        expect(d.baseline).toEqual([60]);
        expect(d.renewal).toEqual([45]); // 레벨 1 의 max(35, 45)
        expect(d.domain).toEqual({ min: 45, max: 60 });
    });

    it("자격 캔들 0개 레벨은 어느 줄에도 없다 — 격자 자체가 비면 도메인 null", () => {
        const jump = grid({
            pivots: [hi(575, 10300, 585), lo(585, 10100)],
            newHighs: [nh(600, 10500, 70)], // 한 번에 레벨 1 귀속 — 기준선 줄 비움
        });
        const d = buildGateDistribution(byDate([jump]), DEF0);
        expect(d.baseline).toEqual([]);
        expect(d.renewal).toEqual([70]);
        expect(buildGateDistribution(byDate([grid({ base: null })]), DEF0).domain).toBeNull();
    });

    it("게이트 필드는 산출에 영향 없다(분포 불변 계약) — 비게이트 노브는 모수를 바꾼다", () => {
        const g = grid({ newHighs: [nh(560, 10050, 90, false), nh(570, 10100, 60)] });
        // 전체 PointDefinition 은 PointCandidateDef 자리에 놓일 수 있다(구조 타이핑) — 게이트가 딴 값이어도 무영향.
        const gated: typeof DEF0 = { ...DEF0, baselineGateEok: 999, renewalGateEok: 999 };
        const a = buildGateDistribution(byDate([g]), gated);
        expect(a.baseline).toEqual([60]); // 음봉 90억은 bullOnly 에 걸려 모수 밖
        const b = buildGateDistribution(byDate([g]), { ...DEF0, bullOnly: false });
        expect(b.baseline).toEqual([90]);
    });

    it("단일값 도메인 — min === max 로 나온다(스트립은 방향만 값 비교로 잡는다)", () => {
        const g = grid({ newHighs: [nh(560, 10050, 60)] });
        expect(buildGateDistribution(byDate([g]), DEF0).domain).toEqual({ min: 60, max: 60 });
        expect(gateValueAt(0.7, { min: 60, max: 60 })).toBe(60); // span 0 의 역함수 = 그 값
    });

    it("gateValueAt 은 valueToFrac(log) 의 역함수다 — 왕복이 닫힌다(클릭 커밋 ↔ 컷선 정합)", () => {
        const domain = { min: 20, max: 6600 };
        for (const v of [20, 30, 50, 78, 269, 1362, 6600]) {
            const f = valueToFrac(v, domain, "higher", "log");
            expect(gateValueAt(f, domain)).toBeCloseTo(v, 6);
        }
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
            expect(valueToFrac(gateValueAt(f, domain), domain, "higher", "log")).toBeCloseTo(f, 6);
        }
    });
});
