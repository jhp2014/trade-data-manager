import { DEFAULT_CHAIN_FILTER, type ChainCond, type ChainFilter } from "../chainFilter.js";
import { DEFAULT_THEME_ZONE, themeCutsOff, type ThemeZoneParams } from "../themeZone.js";
import { describe, it, expect, vi } from "vitest";
import { evaluateCells, evaluateCellsExpr, type CellMaterials, type CellStock } from "../engine.js";
import type { CellConditions, CellExpr, CellPredicate } from "../predicate.js";
import { kstToUnix } from "../../kst.js";

// 픽스처 — 09:00 부터 1분 간격 dense 타임라인(probe 테스트와 같은 모양).
const DATE = "2026-09-16";
const t0 = kstToUnix(DATE, "09:00:00");
const MIN0 = 9 * 60;

function stock(code: string, over: Partial<CellStock> & { n?: number } = {}): CellStock {
    const n = over.n ?? 5;
    const seq = (v: number[] | undefined, fill: number): number[] => v ?? new Array(n).fill(fill);
    return {
        code,
        times: over.times ?? Array.from({ length: n }, (_, i) => t0 + i * 60),
        rate: seq(over.rate as number[] | undefined, 0),
        cumAmount: seq(over.cumAmount as number[] | undefined, 0),
        minuteHigh: seq(over.minuteHigh as number[] | undefined, 0),
        minuteOpen: seq(over.minuteOpen as number[] | undefined, 0),
        minuteLow: seq(over.minuteLow as number[] | undefined, 0),
        basePrice: over.basePrice ?? { krx: null, un: null },
    };
}

const NO_MAT: CellMaterials = { themeAt: () => null };

/** 등락률 ≥ r 칸 하나(캔들 rate 축 — 옛 ratePct 셀 값의 후신). */
const rateCond = (r: number): CellConditions => [
    {
        id: "c",
        enabled: true,
        predicates: [
            { kind: "candle", axes: { rate: { on: true, from: r } } },
        ],
    },
];

const mins = (r: { hits: { min: number }[] }): number[] => r.hits.map((h) => h.min - MIN0);

describe("evaluateCells — 기본", () => {
    it("참인 셀마다 걸린다(시점 판정 — 전이 은퇴 2026-09-27)", () => {
        const s = stock("A", { rate: [1, 6, 6, 2, 7] });
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5)))).toEqual([1, 2, 4]);
    });

    it("조건이 없거나 전부 꺼져 있으면 빈 목록 — '조건 없음 = 전부'가 아니다", () => {
        const s = stock("A", { rate: [9, 9, 9, 9, 9] });
        expect(evaluateCells([s], NO_MAT, []).hits).toEqual([]);
        expect(evaluateCells([s], NO_MAT, [{ id: "c", enabled: false, predicates: [{ kind: "candle", axes: { openClose: { on: true, from: 0.01 } } }] }]).hits).toEqual([]);
    });

    it("빈 술어만 든 칸은 '무제한'이 아니라 빠진다 — 19만 셀을 통째로 통과시키지 않는다", () => {
        const s = stock("A", { rate: [9, 9, 9, 9, 9] });
        expect(evaluateCells([s], NO_MAT, [{ id: "c", enabled: true, predicates: [{ kind: "candle", axes: {} }] }]).hits).toEqual([]);
    });

    it("같은 셀에 두 칸이 걸리면 한 항목에 조건 id 둘, 정렬은 분↑ → 코드↑", () => {
        const a = stock("B", { rate: [6, 0, 0, 0, 0] });
        const b = stock("A", { rate: [0, 6, 0, 0, 0] });
        const conds: CellConditions = [
            { id: "x", enabled: true, predicates: [{ kind: "candle", axes: { rate: { on: true, from: 5 } } }] },
            { id: "y", enabled: true, predicates: [{ kind: "candle", axes: { rate: { on: true, from: 1 } } }] },
        ];
        const r = evaluateCells([a, b], NO_MAT, conds);
        expect(r.hits.map((h) => `${h.code}@${h.min - MIN0}`)).toEqual(["B@0", "A@1"]);
        expect(r.hits[0].tags).toEqual(["x", "y"]);
        // matched 는 **셀 수**(목록 행 수와 같은 단위), byCondition 은 칸별 발화 수 — 겹치는 셀만큼 다르다.
        expect(r.matched).toBe(2);
        expect(r.byCondition.get("x")).toBe(2);
        expect(r.byCondition.get("y")).toBe(2);
    });

    it("값 구간은 양끝 포함·OR·뒤집힘 스왑, 타점 앵커 경계는 결손(그 구간만 무시)", () => {
        const s = stock("A", { cumAmount: [1e8, 5e8, 7e8, 9e8, 11e8] });
        const ranges = [{ from: { kind: "value" as const, value: 9 }, to: { kind: "value" as const, value: 5 } }, { from: { kind: "point" as const, point: "p" } }];
        const r = evaluateCells([s], NO_MAT, [{ id: "c", enabled: true, predicates: [{ kind: "cellValue", field: "cumAmountEok", ranges }] }]);
        expect(mins(r)).toEqual([1, 2, 3]);
    });

    it("캔들 축 — From·To 양끝 포함 AND, 두 축이 한 술어에서 같이 걸린다", () => {
        const s = stock("A", { rate: [1, 6, 8, 12, 6], minuteOpen: [0, 5, 8, 9, 7] });
        // rate 6~12 ∧ 시가→종가 ≥ 0 — 0분(rate 1)은 첫 축에서, 4분(시가 7 → 종가 6, 음봉)은 둘째 축에서
        // 떨어진다. 2분(시가 = 종가, 0%)은 From 0 에 **포함**된다(양끝 포함).
        const conds: CellConditions = [{ id: "c", enabled: true, predicates: [{ kind: "candle", axes: {
            rate: { on: true, from: 6, to: 12 },
            openClose: { on: true, from: 0 },
        } }] }];
        expect(mins(evaluateCells([s], NO_MAT, conds))).toEqual([1, 2, 3]);
    });

    it("캔들 시가 기점 축(시→고·시→저)·고가 등락률 — 가격 비(movePct)로 잰다", () => {
        // 분 0: 시가 0, 고가 3, 저가 −2, 종가 1. movePct(0,3)=3, movePct(0,−2)=−2.
        const s = stock("A", { n: 1, minuteOpen: [0], minuteHigh: [3], minuteLow: [-2], rate: [1] });
        const one = (axes: Record<string, { on: boolean; from?: number; to?: number }>): CellConditions =>
            [{ id: "c", enabled: true, predicates: [{ kind: "candle", axes }] }];
        expect(mins(evaluateCells([s], NO_MAT, one({ openHigh: { on: true, from: 2.5 } })))).toEqual([0]);
        expect(mins(evaluateCells([s], NO_MAT, one({ openHigh: { on: true, from: 3.5 } })))).toEqual([]);
        expect(mins(evaluateCells([s], NO_MAT, one({ openLow: { on: true, from: -2.5 } })))).toEqual([0]);
        expect(mins(evaluateCells([s], NO_MAT, one({ openLow: { on: true, from: -1.5 } })))).toEqual([]);
        expect(mins(evaluateCells([s], NO_MAT, one({ highRate: { on: true, from: 3, to: 3 } })))).toEqual([0]);
        // 뒤집힌 구간은 스왑(셀 값 inRanges 와 같은 규칙 — 리뷰 M2).
        expect(mins(evaluateCells([s], NO_MAT, one({ highRate: { on: true, from: 4, to: 2 } })))).toEqual([0]);
    });

    it("캔들 기준선 축 — 종가 기준, 기준선 없으면 결손(미발화)", () => {
        // 기준선 1000 = 기준가와 같아 baselinePct 0%. 종가 %: [−1, 0, 2] → 기준선 대비 [−1, 0, +2]%.
        const s = stock("A", { rate: [-1, 0, 2], n: 3, basePrice: { krx: null, un: 1000 } });
        const conds: CellConditions = [{ id: "c", enabled: true, predicates: [{ kind: "candle", axes: {
            baseline: { on: true, from: 0 },
        } }] }];
        const withBase: CellMaterials = { themeAt: () => null, baselineOf: () => 1000 };
        expect(mins(evaluateCells([s], withBase, conds))).toEqual([1, 2]);
        expect(evaluateCells([s], NO_MAT, conds).hits, "기준선 없음 = 결손").toEqual([]);
    });

    it("시각 술어는 HH:MM 양끝 포함", () => {
        const s = stock("A", { n: 5 });
        const r = evaluateCells([s], NO_MAT, [{ id: "c", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:01", to: "09:03" }] }] }]);
        expect(mins(r)).toEqual([1, 2, 3]);
    });
});

describe("evaluateCells — 게으름·상한", () => {
    it("비싼 재료(테마 존)는 싼 술어를 통과한 셀에서만 불린다", () => {
        const s = stock("A", { n: 10, rate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9] });
        const themeAt = vi.fn(() => ({ pass: true, zoneRank: 1, theme: "T" }));
        const conds: CellConditions = [
            {
                id: "c",
                enabled: true,
                predicates: [
                    { kind: "theme", ...DEFAULT_THEME_ZONE, ...themeCutsOff(), zoneRank: { on: true, max: 3 } },
                    { kind: "candle", axes: { rate: { on: true, from: 5 } } },
                ],
            },
        ];
        const r = evaluateCells([s], { themeAt }, conds);
        expect(mins(r)).toEqual([9]);
        expect(themeAt).toHaveBeenCalledTimes(1); // 10 셀 중 1
    });

    it("상한은 산출물 상한이다 — 전량 평가 후 정렬해 앞에서 자르고 matched 는 총수를 말한다", () => {
        const stocks = ["A", "B", "C"].map((c) => stock(c, { n: 4, rate: [9, 9, 9, 9] }));
        const r = evaluateCells(stocks, NO_MAT, rateCond(5), { limit: 5 });
        expect(r.hits).toHaveLength(5);
        expect(r.matched).toBe(12); // 셀 12개(칸 하나라 발화 수와 같다)
        expect(r.truncated).toBe(true);
        // 앞에서 자르므로 이른 분이 남는다(코드 앞 종목만 남는 편향이 아니다)
        expect(r.hits.map((h) => `${h.code}@${h.min - MIN0}`)).toEqual(["A@0", "B@0", "C@0", "A@1", "B@1"]);
    });

    it("HARD_CAP 을 넘으면 즉시 접고 tooWide 로 말한다", () => {
        const stocks = ["A", "B", "C"].map((c) => stock(c, { n: 20, rate: new Array(20).fill(9) }));
        const r = evaluateCells(stocks, NO_MAT, rateCond(5), { limit: 100, hardCap: 10 });
        expect(r.tooWide).toBe(true);
        expect(r.matched).toBeLessThanOrEqual(60);
    });

    it("그물은 **셀 수** 기준이다 — 켜진 칸이 늘어도 조여지지 않는다", () => {
        const stocks = ["A", "B", "C"].map((c) => stock(c, { n: 20, rate: new Array(20).fill(9) }));
        const four: CellConditions = ["a", "b", "c", "d"].map((id) => ({
            id,
            enabled: true,
            predicates: [{ kind: "candle", axes: { rate: { on: true, from: 5 } } }],
        }));
        // 칸 4개라 발화 수는 240 이지만 셀은 60 — hardCap 100 에 안 걸려야 한다(발화 수로 세면 걸린다).
        const r = evaluateCells(stocks, NO_MAT, four, { limit: 1000, hardCap: 100 });
        expect(r.tooWide).toBe(false);
        expect(r.matched).toBe(60);
        expect(r.byCondition.get("a")).toBe(60);
    });

    it("빈 종목·빈 재료는 조용히 빈 목록", () => {
        expect(evaluateCells([], NO_MAT, rateCond(5)).hits).toEqual([]);
        expect(evaluateCells([stock("A", { n: 0, times: [] })], NO_MAT, rateCond(5)).hits).toEqual([]);
    });
});

describe("evaluateCells — 라벨(분류)", () => {
    // 재료: 차트 A 하루 라벨 {후발주}, 차트 B 09:02 좌표 라벨 {돌파: 성공}. 판정(계층 상속 포함)은 재료 층 몫.
    const a = stock("A", { n: 4 });
    const b = stock("B", { n: 4 });
    const labelAt: CellMaterials["labelAt"] = (code, min, scope, groups) =>
        scope === "day"
            ? code === "A" && groups.includes("후발주")
            : code === "B" && min === MIN0 + 2 && groups.includes("돌파: 성공");
    const mat: CellMaterials = { themeAt: () => null, labelAt };
    const at = (r: { hits: { code: string; min: number }[] }): string[] => r.hits.map((h) => `${h.code}@${h.min - MIN0}`);
    const cond = (scope: "day" | "point", groups: string[], neg = false): CellExpr =>
        ({ kind: "pred", id: "l", pred: { kind: "label", scope, groups }, ...(neg ? { neg: true as const } : {}) });

    it("day — 하루 라벨이 붙은 차트의 **모든 분**이 통과한다(하위 분들이 물려받는다)", () => {
        expect(at(evaluateCellsExpr([a, b], mat, cond("day", ["후발주"])))).toEqual(["A@0", "A@1", "A@2", "A@3"]);
    });

    it("point — 정확히 그 좌표만 통과한다", () => {
        expect(at(evaluateCellsExpr([a, b], mat, cond("point", ["돌파: 성공"])))).toEqual(["B@2"]);
    });

    it("groups 는 OR — 하나라도 맞으면 통과, 모르는 이름은 조용히 거짓", () => {
        expect(at(evaluateCellsExpr([a, b], mat, cond("point", ["없는 그룹", "돌파: 성공"])))).toEqual(["B@2"]);
        expect(evaluateCellsExpr([a, b], mat, cond("point", ["없는 그룹"])).hits).toEqual([]);
    });

    it("NOT 라벨 — 아직 분류 안 한 셀(분류 작업 큐의 모양)", () => {
        const notLabeled = at(evaluateCellsExpr([b], mat, cond("point", ["돌파: 성공"], true)));
        expect(notLabeled).toEqual(["B@0", "B@1", "B@3"]);
    });

    it("재료(labelAt) 가 없으면 거짓 — 지어내지 않는다", () => {
        expect(evaluateCellsExpr([a, b], NO_MAT, cond("day", ["후발주"])).hits).toEqual([]);
    });
});

describe("evaluateCells — 종목 그룹째 자르기(limitBy)", () => {
    it("상한을 넘기는 종목은 **통째로** 빠진다 — 반토막이면 종목 머리의 수가 거짓말한다", () => {
        // A 2셀 · B 3셀 · C 2셀(전부 같은 분대에 흩어짐) — 상한 5
        const a = stock("A", { n: 5, rate: [9, 9, 0, 0, 0] });
        const b = stock("B", { n: 5, rate: [9, 9, 9, 0, 0] });
        const c = stock("C", { n: 5, rate: [9, 9, 0, 0, 0] });
        const r = evaluateCells([a, b, c], NO_MAT, rateCond(5), { limit: 5, limitBy: "stockGroup" });
        const byCode = new Map<string, number>();
        for (const h of r.hits) byCode.set(h.code, (byCode.get(h.code) ?? 0) + 1);
        // 어떤 종목이 남든 **부분 종목은 없다**(각 종목은 제 전량 또는 0).
        const whole: Record<string, number> = { A: 2, B: 3, C: 2 };
        for (const [code, n] of Object.entries(whole)) {
            expect([0, n], `${code} 는 전량 또는 0 이어야 한다`).toContain(byCode.get(code) ?? 0);
        }
        expect(r.hits.length).toBeLessThanOrEqual(5);
        expect(r.matched).toBe(7); // 총수는 자르기와 무관하다
        expect(r.truncated).toBe(true);
    });

    it("기본(cell)은 시각 프리픽스 컷 — 기존 동작이 안 바뀐다", () => {
        const a = stock("A", { n: 5, rate: [9, 9, 9, 9, 9] });
        const b = stock("B", { n: 5, rate: [9, 9, 9, 9, 9] });
        const r = evaluateCells([a, b], NO_MAT, rateCond(5), { limit: 3 });
        expect(r.hits.map((h) => `${h.code}@${h.min - MIN0}`)).toEqual(["A@0", "B@0", "A@1"]);
    });
});

describe("evaluateCellsExpr — 루트의 부정", () => {
    const rate5 = (id: string): CellExpr =>
        ({ kind: "pred", id, pred: { kind: "candle", axes: { rate: { on: true, from: 5 } } } });
    const s = stock("A", { n: 5, rate: [0, 9, 9, 0, 9] });

    // ⚠ 루트 OR 은 태그를 달려고 **가지를 직접 돈다**(byCondition·tags 가 화면 재료라서). 그때
    //   `runNode(root)` 를 안 지나 `root.neg` 가 통째로 증발하면 `¬(a ∨ b)` 가 정확히 **반대 집합**으로
    //   평가된다 — 오류도 결손도 없이 틀린 답이라, 이 검사가 유일한 증인이다.
    it("¬(a ∨ b) 는 a ∨ b 의 여집합이다 — 가지를 쪼개 돌더라도 부정이 안 사라진다", () => {
        const or: CellExpr = { kind: "or", id: "root", of: [rate5("x"), rate5("y")] };
        expect(mins(evaluateCellsExpr([s], NO_MAT, or))).toEqual([1, 2, 4]);
        expect(mins(evaluateCellsExpr([s], NO_MAT, { ...or, neg: true }))).toEqual([0, 3]);
    });

    it("¬(a ∧ b) 도 같은 규칙 — 루트 AND 는 원래 쪼개지 않는다", () => {
        const and: CellExpr = { kind: "and", id: "root", of: [rate5("x")] };
        expect(mins(evaluateCellsExpr([s], NO_MAT, and))).toEqual([1, 2, 4]);
        expect(mins(evaluateCellsExpr([s], NO_MAT, { ...and, neg: true }))).toEqual([0, 3]);
    });
});

describe("돌파 생성기 + 캔들·분봉 대금 필터", () => {
    // 분 0~4: 고가 0 → −0.2 → 0.3 → 0.1 → 0.2(저가 −1.8 로 사슬 끝). 분 대금 20·50·40·60·70억.
    const s = stock("A", {
        minuteHigh: [0, -0.2, 0.3, 0.1, 0.2],
        minuteLow: [-0.5, -0.8, 0, -0.3, -1.8],
        minuteOpen: [-0.5, -0.1, 0, 0, 0.1],
        rate: [0, -0.5, 0.2, 0.1, -1],
        cumAmount: [20e8, 70e8, 110e8, 170e8, 240e8],
        basePrice: { krx: null, un: 10_000 },
    });
    const bo = (over: Partial<Extract<CellPredicate, { kind: "breakout" }>> = {}): CellExpr =>
        ({ kind: "pred", id: "b", pred: { kind: "breakout", zigzagPct: 2, bandPct: 1, chain: DEFAULT_CHAIN_FILTER, ...over } });
    /** 봉 조건들을 AND 로 이은 사슬 필터(꼬리 순번 k). */
    const cf = (k: number | null, ...conds: ChainCond[]): ChainFilter => ({
        expr: { id: "chain", of: conds.map((cond, i) => ({ kind: "check" as const, id: `c${i}`, cond })), ops: conds.slice(1).map(() => "and" as const), groups: [] },
        firstK: k,
    });
    const all = cf(null);
    const label = (l: "baseline" | "high"): ChainCond => ({ kind: "label", label: l });
    const and = (...of: CellExpr[]): CellExpr => ({ kind: "and", id: "a", of });
    const bull: CellExpr = { kind: "pred", id: "c", pred: { kind: "candle", axes: { openClose: { on: true, from: 0.01 } } } };

    it("기본(처음 1개) = 사슬 첫 봉, 전부 = 사슬 봉 전부", () => {
        expect(mins(evaluateCellsExpr([s], NO_MAT, bo()))).toEqual([0]);
        expect(mins(evaluateCellsExpr([s], NO_MAT, bo({ chain: all })))).toEqual([0, 1, 2, 3]);
    });

    it("사슬 테마 칩 — 재료는 종목으로 묶여 가고(분 = 자정기준), 모름이면 그 종목 발화 0", () => {
        const THEME: ChainCond = { kind: "theme", ...DEFAULT_THEME_ZONE };
        const themeAt = vi.fn((_code: string, min: number) => ({ pass: min >= MIN0 + 2, zoneRank: null, theme: null }));
        const r = evaluateCellsExpr([s], { themeAt }, bo({ chain: cf(1, THEME) }));
        expect(mins(r)).toEqual([2]); // 처음 존을 만족한 봉
        expect(themeAt.mock.calls.every((c) => c[0] === "A")).toBe(true);
        expect(evaluateCellsExpr([s], NO_MAT, bo({ chain: cf(1, THEME) })).hits, "모름 = 발화 없음").toEqual([]);
    });

    it("사슬 필터 N억 처음 만족 = 대금 ≥ N + 처음 1개", () => {
        expect(mins(evaluateCellsExpr([s], NO_MAT, bo({ chain: cf(1, { kind: "amount", minEok: 45 }) })))).toEqual([1]);
    });

    it("생성소의 양봉 필터는 순번 셈에 안 든다 — 45억 처음 만족 봉(분 1)이 음봉이면 다음 봉으로 안 넘어간다", () => {
        expect(mins(evaluateCellsExpr([s], NO_MAT, and(bo({ chain: cf(1, { kind: "amount", minEok: 45 }) }), bull)))).toEqual([]);
        expect(mins(evaluateCellsExpr([s], NO_MAT, and(bo({ chain: all }), bull)))).toEqual([0, 2, 3]);
    });

    it("분봉 대금 필터 — 사슬 봉 전부 중 대금 ≥ 55억", () => {
        const amt: CellExpr = { kind: "pred", id: "m", pred: { kind: "cellValue", field: "minuteAmountEok", ranges: [{ from: { kind: "value", value: 55 } }] } };
        expect(mins(evaluateCellsExpr([s], NO_MAT, and(bo({ chain: all }), amt)))).toEqual([3]);
    });

    it("기준선 재료가 있으면 이름표가 갈린다 — 기준선 0.1% 밴드에서 사슬이 시작해 끝까지 기준선", () => {
        // 기준선 가격 10,010 = 0.1% (분봉과 같은 반올림). 밴드 1% → 하단 ≈ −0.9 라 분 0(0) 부터 기준선 밴드 사건.
        const mat: CellMaterials = { ...NO_MAT, baselineOf: () => 10_010 };
        const r = evaluateCellsExpr([s], mat, bo({ chain: cf(null, label("baseline")) }));
        expect(mins(r)).toEqual([0, 1, 2, 3]);
        expect(evaluateCellsExpr([s], mat, bo({ chain: cf(null, label("high")) })).hits).toEqual([]);
        expect(evaluateCellsExpr([s], NO_MAT, bo({ chain: cf(1, label("baseline")) })).hits).toEqual([]); // 기준선 없음 = 전부 고가
    });

    it("이름표만 다른 두 잎은 다른 후보다 — 이름표 분리는 후보 키에 달려 있다", () => {
        const mat: CellMaterials = { ...NO_MAT, baselineOf: () => 10_010 };
        const both: CellExpr = { kind: "and", id: "a", of: [bo({ chain: cf(null, label("baseline")) }), { ...bo({ chain: cf(null, label("high")) }), id: "h" }] };
        expect(evaluateCellsExpr([s], mat, both).hits).toEqual([]);
        const either: CellExpr = { kind: "or", id: "r", of: [bo({ chain: cf(null, label("high")) }), { ...bo({ chain: cf(null, label("baseline")) }), id: "h" }] };
        expect(mins(evaluateCellsExpr([s], mat, either))).toEqual([0, 1, 2, 3]);
    });

    it("같은 구조 키(zigzag·밴드)는 종목당 한 번 — 이름표·사슬 필터만 다른 잎들이 사슬을 두 번 세우지 않는다", () => {
        const baselineOf = vi.fn(() => null);
        const two: CellExpr = {
            kind: "or",
            id: "r",
            of: [bo(), { ...bo({ chain: cf(1, label("high")) }), id: "y" }, { ...bo({ chain: all }), id: "z" }],
        };
        evaluateCellsExpr([s], { ...NO_MAT, baselineOf }, two);
        expect(baselineOf).toHaveBeenCalledTimes(1);
    });
});

describe("theme 술어 — payload 파라미터·게으름·hit 존순위", () => {
    const TP: ThemeZoneParams = { ...DEFAULT_THEME_ZONE, count: { on: true, min: 2 } };
    const themeCond = (over: Partial<typeof TP> & { enter?: boolean } = {}): CellConditions => [
        { id: "t", enabled: true, predicates: [{ kind: "theme", ...TP, ...over }] },
    ];

    it("themeAt 의 pass 가 곧 발화 — null(재료 없음)은 미발화(모름 ≠ 통과)", () => {
        const s = stock("A", { rate: [1, 1, 1] , n: 3 });
        const seq: (boolean | null)[] = [true, null, false];
        const mat: CellMaterials = {
            themeAt: (_c, min) => { const p = seq[min - MIN0]; return p === null ? null : { pass: p, zoneRank: p ? 2 : null, theme: p ? "T" : null }; },
        };
        const r = evaluateCells([s], mat, themeCond());
        expect(mins(r)).toEqual([0]);
        // 발화한 셀에는 존 순위·테마가 실린다(옛 zoneRank 셀 값과 같은 표시 재료).
        expect(r.hits[0]).toMatchObject({ zoneRank: 2, zoneTheme: "T" });
    });

    it("단락 뒤에만 부른다 — 싼 조건이 먼저 떨어뜨린 셀에서는 호출 0", () => {
        const s = stock("A", { rate: [1, 6, 1, 6, 1] });
        const themeAt = vi.fn(() => ({ pass: true, zoneRank: 1, theme: "T" }));
        const conds: CellConditions = [{
            id: "c", enabled: true,
            predicates: [
                { kind: "candle", axes: { rate: { on: true, from: 5 } } },
                { kind: "theme", ...TP },
            ],
        }];
        const r = evaluateCells([s], { themeAt }, conds);
        expect(mins(r)).toEqual([1, 3]);
        expect(themeAt).toHaveBeenCalledTimes(2); // 5 셀 중 등락 통과 2 셀에서만
    });

    it("같은 셀·같은 파라미터는 한 번만 묻고, 파라미터가 다르면 각각 묻는다(키 = payload)", () => {
        const s = stock("A", { n: 1 });
        const themeAt = vi.fn(() => ({ pass: true, zoneRank: 1, theme: "T" }));
        const conds: CellConditions = [
            { id: "a", enabled: true, predicates: [{ kind: "theme", ...TP }] },
            { id: "b", enabled: true, predicates: [{ kind: "theme", ...TP }] },
            { id: "c", enabled: true, predicates: [{ kind: "theme", ...TP, count: { on: true, min: 9 } }] },
        ];
        evaluateCells([s], { themeAt }, conds);
        expect(themeAt).toHaveBeenCalledTimes(2); // (TP) 한 번 + (재적 9~) 한 번
    });

    it("enter 만 다른 두 술어는 **다른 판정**이다 — 셀당 답 캐시 키가 갈린다(themeZoneKeyOf)", () => {
        // enter 판정 자체는 재료 층(themeAnswerAt — themeZone.test)이 잠근다. 엔진은 payload 를
        // 그대로 재료에 넘기고 캐시 키로만 가른다 — 키에서 enter 가 빠지면 두 술어가 한 답을 나눠 쓴다.
        const s = stock("A", { n: 1 });
        const themeAt = vi.fn(() => ({ pass: true, zoneRank: 1, theme: "T" }));
        const conds: CellConditions = [
            { id: "a", enabled: true, predicates: [{ kind: "theme", ...TP }] },
            { id: "b", enabled: true, predicates: [{ kind: "theme", ...TP, enter: true }] },
        ];
        evaluateCells([s], { themeAt }, conds);
        expect(themeAt).toHaveBeenCalledTimes(2);
    });

    it("빈 술어(활성 하위 조건 0)는 평가에서 빠진다 — '조건 없음 = 전부'가 되지 않게", () => {
        const s = stock("A", { n: 2 });
        const themeAt = vi.fn(() => ({ pass: true, zoneRank: 1, theme: "T" }));
        const r = evaluateCells([s], { themeAt },
            themeCond(themeCutsOff()));
        expect(r.hits).toEqual([]);
        expect(themeAt).not.toHaveBeenCalled();
    });
});
