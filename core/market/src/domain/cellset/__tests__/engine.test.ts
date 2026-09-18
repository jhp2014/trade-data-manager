import { describe, it, expect, vi } from "vitest";
import { evaluateCells, type CellMaterials, type CellStock } from "../engine.js";
import type { CellConditions, Transition } from "../predicate.js";
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
        trailingHighs: over.trailingHighs ?? { krx: [], un: [] },
    };
}

const NO_MAT: CellMaterials = { gridMinutesOf: () => [], zoneRankAt: () => null };

/** 등락률 ≥ r 칸 하나 — 전이를 술어/칸 어느 자리에 둘지 골라서. */
const rateCond = (r: number, at: "none" | "pred" | "cond" = "none", t: Transition = "firstTrue"): CellConditions => [
    {
        id: "c",
        enabled: true,
        ...(at === "cond" ? { transition: t } : {}),
        predicates: [
            {
                kind: "cellValue",
                field: "ratePct",
                ranges: [{ from: { kind: "value", value: r } }],
                ...(at === "pred" ? { transition: t } : {}),
            },
        ],
    },
];

const mins = (r: { hits: { min: number }[] }): number[] => r.hits.map((h) => h.min - MIN0);

describe("evaluateCells — 기본", () => {
    it("전이 없으면 참인 셀마다 걸린다", () => {
        const s = stock("A", { rate: [1, 6, 6, 2, 7] });
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5)))).toEqual([1, 2, 4]);
    });

    it("조건이 없거나 전부 꺼져 있으면 빈 목록 — '조건 없음 = 전부'가 아니다", () => {
        const s = stock("A", { rate: [9, 9, 9, 9, 9] });
        expect(evaluateCells([s], NO_MAT, []).hits).toEqual([]);
        expect(evaluateCells([s], NO_MAT, [{ id: "c", enabled: false, predicates: [{ kind: "gridPoint" }] }]).hits).toEqual([]);
    });

    it("빈 술어만 든 칸은 '무제한'이 아니라 빠진다 — 19만 셀을 통째로 통과시키지 않는다", () => {
        const s = stock("A", { rate: [9, 9, 9, 9, 9] });
        expect(evaluateCells([s], NO_MAT, [{ id: "c", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [] }] }]).hits).toEqual([]);
    });

    it("같은 셀에 두 칸이 걸리면 한 항목에 조건 id 둘, 정렬은 분↑ → 코드↑", () => {
        const a = stock("B", { rate: [6, 0, 0, 0, 0] });
        const b = stock("A", { rate: [0, 6, 0, 0, 0] });
        const conds: CellConditions = [
            { id: "x", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] }] },
            { id: "y", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 1 } }] }] },
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
        const s = stock("A", { rate: [1, 5, 7, 9, 11] });
        const ranges = [{ from: { kind: "value" as const, value: 9 }, to: { kind: "value" as const, value: 5 } }, { from: { kind: "point" as const, point: "p" } }];
        const r = evaluateCells([s], NO_MAT, [{ id: "c", enabled: true, predicates: [{ kind: "cellValue", field: "ratePct", ranges }] }]);
        expect(mins(r)).toEqual([1, 2, 3]);
    });

    it("시각 술어는 HH:MM 양끝 포함", () => {
        const s = stock("A", { n: 5 });
        const r = evaluateCells([s], NO_MAT, [{ id: "c", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:01", to: "09:03" }] }] }]);
        expect(mins(r)).toEqual([1, 2, 3]);
    });
});

describe("evaluateCells — 전이", () => {
    it("firstTrue = 상승 엣지마다(하루 여러 번), firstOfDay = 하루 1회", () => {
        const s = stock("A", { rate: [6, 6, 1, 6, 6] });
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5, "pred", "firstTrue")))).toEqual([0, 3]);
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5, "pred", "firstOfDay")))).toEqual([0]);
    });

    it("첫 봉에서 이미 참이면 발화한다 — 갭으로 조건을 만족한 종목을 놓치지 않는다", () => {
        const s = stock("A", { rate: [9, 9, 9, 9, 9] });
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5, "pred", "firstTrue")))).toEqual([0]);
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5, "pred", "improve")))).toEqual([0]);
    });

    it("improve 는 밑값 개선 + **직전 미참**(결손·이탈 포함)에서 발화한다", () => {
        // 등락률: 6(진입) 6(유지) 7(개선) 1(이탈) 6(재진입)
        const s = stock("A", { rate: [6, 6, 7, 1, 6] });
        expect(mins(evaluateCells([s], NO_MAT, rateCond(5, "pred", "improve")))).toEqual([0, 2, 4]);
    });

    it("improve 의 방향은 술어 종류가 안다 — 존 순위는 **작아지는 것**이 개선이다", () => {
        const s = stock("A", { n: 4 });
        const seq: (number | null)[] = [3, 3, 2, 4];
        const mat: CellMaterials = { gridMinutesOf: () => [], zoneRankAt: (_c, min) => (seq[min - MIN0] === null ? null : { rank: seq[min - MIN0]!, theme: "T" }) };
        const conds: CellConditions = [
            { id: "z", enabled: true, predicates: [{ kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 5 } }], transition: "improve" }] },
        ];
        expect(mins(evaluateCells([s], mat, conds))).toEqual([0, 2]);
    });

    it("술어 자리와 칸 자리는 **술어 하나짜리 칸에서 동치**다(UI 문법이 어느 쪽으로 가도 저장물이 안 흔들린다)", () => {
        const s = stock("A", { rate: [6, 6, 1, 7, 7] });
        for (const t of ["firstOfDay", "firstTrue", "improve"] as Transition[]) {
            const byPred = mins(evaluateCells([s], NO_MAT, rateCond(5, "pred", t)));
            const byCond = mins(evaluateCells([s], NO_MAT, rateCond(5, "cond", t)));
            expect(byCond, `전이 ${t}`).toEqual(byPred);
        }
    });

    it("하루 경계 — 종목이 바뀌면 상태가 새로 시작한다(전 종목의 fired 가 안 샌다)", () => {
        const a = stock("A", { rate: [6, 6, 6, 6, 6] });
        const b = stock("B", { rate: [6, 6, 6, 6, 6] });
        const r = evaluateCells([a, b], NO_MAT, rateCond(5, "cond", "firstOfDay"));
        expect(r.hits.map((h) => `${h.code}@${h.min - MIN0}`)).toEqual(["A@0", "B@0"]);
    });

    it("단락으로 안 본 술어의 직전 상태는 미참으로 되돌아간다 — 모르는 것을 참으로 세지 않는다", () => {
        // 값 술어(비싼 zoneRank)가 싼 술어 뒤에 선다. 싼 술어가 죽은 분에는 zone 을 안 보고,
        // 다시 살아난 분에서 improve 가 "직전 미참"으로 발화해야 한다.
        const s = stock("A", { rate: [9, 0, 9] , n: 3 });
        const mat: CellMaterials = { gridMinutesOf: () => [], zoneRankAt: () => ({ rank: 2, theme: "T" }) };
        const conds: CellConditions = [
            {
                id: "c",
                enabled: true,
                predicates: [
                    { kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 5 } }], transition: "improve" },
                    { kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] },
                ],
            },
        ];
        expect(mins(evaluateCells([s], mat, conds))).toEqual([0, 2]);
    });
});

describe("evaluateCells — 게으름·상한", () => {
    it("비싼 재료(존 순위)는 싼 술어를 통과한 셀에서만 불린다", () => {
        const s = stock("A", { n: 10, rate: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9] });
        const zoneRankAt = vi.fn(() => ({ rank: 1, theme: "T" }));
        const conds: CellConditions = [
            {
                id: "c",
                enabled: true,
                predicates: [
                    { kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 3 } }] },
                    { kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] },
                ],
            },
        ];
        const r = evaluateCells([s], { gridMinutesOf: () => [], zoneRankAt }, conds);
        expect(mins(r)).toEqual([9]);
        expect(zoneRankAt).toHaveBeenCalledTimes(1); // 10 셀 중 1
    });

    it("같은 셀의 여러 칸이 존 순위를 물어도 재료 호출은 한 번", () => {
        const s = stock("A", { n: 3, rate: [9, 9, 9] });
        const zoneRankAt = vi.fn(() => ({ rank: 1, theme: "T" }));
        const one = (id: string): CellConditions[number] => ({
            id,
            enabled: true,
            predicates: [{ kind: "cellValue", field: "zoneRank", ranges: [{ to: { kind: "value", value: 3 } }] }],
        });
        evaluateCells([s], { gridMinutesOf: () => [], zoneRankAt }, [one("a"), one("b")]);
        expect(zoneRankAt).toHaveBeenCalledTimes(3);
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
            predicates: [{ kind: "cellValue", field: "ratePct", ranges: [{ from: { kind: "value", value: 5 } }] }],
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

describe("evaluateCells — 격자·전고", () => {
    it("격자 분만 걸리고, 격자 재료는 종목당 한 번만 읽는다", () => {
        const s = stock("A", { n: 5 });
        const gridMinutesOf = vi.fn(() => [MIN0 + 2]);
        const r = evaluateCells([s], { gridMinutesOf, zoneRankAt: () => null }, [{ id: "g", enabled: true, predicates: [{ kind: "gridPoint" }] }]);
        expect(mins(r)).toEqual([2]);
        expect(gridMinutesOf).toHaveBeenCalledTimes(1);
    });

    it("전고 자는 index 0(당일)을 제외한다 — 포함하면 영영 거짓", () => {
        const s = stock("A", { minuteHigh: [2, 10, 11, 11, 11], trailingHighs: { krx: [], un: [20, 8, 5, 3, 1, 2] } });
        const conds: CellConditions = [{ id: "p", enabled: true, transition: "firstOfDay", predicates: [{ kind: "priorHighBreak", days: 5 }] }];
        expect(mins(evaluateCells([s], NO_MAT, conds))).toEqual([1]);
    });

    it("창이 비면(신규 상장) 결손 — 발화하지 않는다", () => {
        const s = stock("A", { minuteHigh: [50, 50, 50, 50, 50], trailingHighs: { krx: [], un: [50] } });
        const conds: CellConditions = [{ id: "p", enabled: true, predicates: [{ kind: "priorHighBreak", days: 5 }] }];
        expect(evaluateCells([s], NO_MAT, conds).hits).toEqual([]);
    });
});
