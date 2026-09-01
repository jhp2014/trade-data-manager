import { describe, it, expect } from "vitest";
import { evalGroupExpr3, evalPredicate3, evalStage, toFunnelStages, type EvalLookup } from "../evaluate.js";
import { NONE_GROUP, type GroupExpr } from "../../rank/groupFilter.js";
import type { FilterPredicate, FilterStage } from "../stage.js";
import type { FunnelItem } from "@trade-data-manager/market/domain";

const item: FunnelItem = { stockCode: "000880", date: "2025-07-01", time: "09:21:00" };
const dayItem: FunnelItem = { stockCode: "000880", date: "2025-07-01" };

/** 기본 재료 — g1·g2 는 살아있는 그룹, a1 은 살아있는 축. 그 밖은 없는 것. */
const base: EvalLookup = {
    groupNamesOf: () => ["g1"],
    anyGroupAt: () => true,
    hasGroup: (id) => id === "g1" || id === "g2",
    orderKeyOf: (axisId) => (axisId === "a1" ? 50 : undefined),
    bandBoundOrderKey: (axisId, slotId) => (axisId === "a1" ? ({ lo: 10, hi: 90 } as Record<string, number>)[slotId] : undefined),
    axisValueOf: (axisId) => (axisId === "c1" ? 7 : undefined),
    boundValue: (_axisId, b) => (b.kind === "value" ? b.value : undefined),
    sectionRanksAt: () => null,
    themeProj: null,
};
const look = (over: Partial<EvalLookup> = {}): EvalLookup => ({ ...base, ...over });

const lit = (groupId: string, neg = false): GroupExpr => ({ groups: [{ literals: [{ groupId, neg }] }] });

// or3·not3 자체의 규칙은 도메인(core funnel.test)에서 잰다 — 여기서는 그 대수로 조립한 결과만 본다.

describe("evalGroupExpr3 — DNF 3치", () => {
    it("소속이면 참, 아니면 거짓", () => {
        expect(evalGroupExpr3(lit("g1"), item, look())).toBe(true);
        expect(evalGroupExpr3(lit("g2"), item, look())).toBe(false);
    });

    it("부정은 뒤집는다", () => {
        expect(evalGroupExpr3(lit("g1", true), item, look())).toBe(false);
        expect(evalGroupExpr3(lit("g2", true), item, look())).toBe(true);
    });

    it("죽은 그룹 참조는 모름 — 멤버십이 지워져 '소속 아님'이 사실이어도 조건이 뜻을 잃었다", () => {
        expect(evalGroupExpr3(lit("없는그룹"), item, look())).toBeUndefined();
        expect(evalGroupExpr3(lit("없는그룹", true), item, look())).toBeUndefined();
    });

    it("'그룹 없음'은 개수 조건이라 사전을 안 본다", () => {
        const 없음 = look({ anyGroupAt: () => false });
        expect(evalGroupExpr3(lit(NONE_GROUP), item, 없음)).toBe(true);
        expect(evalGroupExpr3(lit(NONE_GROUP), item, look())).toBe(false);
        expect(evalGroupExpr3(lit(NONE_GROUP, true), item, look())).toBe(true);
    });

    it("⚠ '그룹 없음'은 **직접 소속 0개**다 — 조상까지 편 합집합(groupNamesOf)으로는 못 묻는다", () => {
        const 조상만편것 = look({
            groupNamesOf: () => ["테마", "2차전지"], // 조상이 합집합에 들어와 있다
            anyGroupAt: () => false, // 그래도 직접 소속은 0
        });
        expect(evalGroupExpr3(lit(NONE_GROUP), item, 조상만편것)).toBe(true);
    });

    it("시각 없는 항목도 같은 답 — 그룹은 차트에 붙는다", () => {
        expect(evalGroupExpr3(lit(NONE_GROUP), dayItem, look())).toBe(false);
        expect(evalGroupExpr3(lit(NONE_GROUP), dayItem, look({ anyGroupAt: () => false }))).toBe(true);
    });

    it("절 안은 AND — 하나라도 거짓이면 거짓", () => {
        const expr: GroupExpr = { groups: [{ literals: [{ groupId: "g1", neg: false }, { groupId: "g2", neg: false }] }] };
        expect(evalGroupExpr3(expr, item, look())).toBe(false);
    });

    it("절끼리는 OR — 죽은 절이 있어도 다른 절이 맞으면 참", () => {
        const expr: GroupExpr = {
            groups: [{ literals: [{ groupId: "없는그룹", neg: false }] }, { literals: [{ groupId: "g1", neg: false }] }],
        };
        expect(evalGroupExpr3(expr, item, look())).toBe(true);
    });

    it("맞는 절이 없고 죽은 절이 있으면 모름 — 거짓이라 단정할 수 없다", () => {
        const expr: GroupExpr = {
            groups: [{ literals: [{ groupId: "없는그룹", neg: false }] }, { literals: [{ groupId: "g2", neg: false }] }],
        };
        expect(evalGroupExpr3(expr, item, look())).toBeUndefined();
    });

    it("빈 식은 무제한(통과)", () => {
        expect(evalGroupExpr3({ groups: [] }, item, look())).toBe(true);
    });
});

describe("evalPredicate3 — 날짜·시간", () => {
    it("날짜는 항목이 늘 들고 있어 모름이 없다", () => {
        const p: FilterPredicate = { kind: "date", ranges: [{ from: "2025-07-01", to: "2025-07-31" }] };
        expect(evalPredicate3(p, item, look())).toBe(true);
        expect(evalPredicate3(p, { ...item, date: "2025-06-30" }, look())).toBe(false);
    });

    it("시각 없는 항목의 시간 조건은 모름 — 탈락시키면 그 하루가 조용히 사라진다", () => {
        const p: FilterPredicate = { kind: "time", ranges: [{ from: "09:00", to: "10:00" }] };
        expect(evalPredicate3(p, dayItem, look())).toBeUndefined();
        expect(evalPredicate3(p, item, look())).toBe(true);
        expect(evalPredicate3(p, { ...item, time: "13:05:00" }, look())).toBe(false);
    });

    it("빈 술어는 조건이 아니라 무제한", () => {
        expect(evalPredicate3({ kind: "date", ranges: [] }, item, look())).toBe(true);
    });
});

describe("evalPredicate3 — 판단 축 밴드", () => {
    const band = (b: { lo?: string; hi?: string }): FilterPredicate => ({ kind: "axisBand", axisId: "a1", band: b });

    it("구간 안이면 참, 밖이면 거짓", () => {
        expect(evalPredicate3(band({ lo: "lo", hi: "hi" }), item, look())).toBe(true);
        expect(evalPredicate3(band({ lo: "lo", hi: "hi" }), item, look({ orderKeyOf: () => 95 }))).toBe(false);
    });

    it("경계를 어느 쪽으로 찍었든 구간은 하나", () => {
        expect(evalPredicate3(band({ lo: "hi", hi: "lo" }), item, look())).toBe(true);
    });

    it("한쪽만 주면 반열림", () => {
        expect(evalPredicate3(band({ lo: "lo" }), item, look({ orderKeyOf: () => 9999 }))).toBe(true);
        expect(evalPredicate3(band({ hi: "lo" }), item, look({ orderKeyOf: () => 9999 }))).toBe(false);
    });

    it("미배치는 모름 — 이게 깔때기의 미배치 칸이 나오는 자리다", () => {
        expect(evalPredicate3(band({ lo: "lo" }), item, look({ orderKeyOf: () => undefined }))).toBeUndefined();
    });

    it("사라진 슬롯을 가리키는 밴드는 모름(깨진 조건)", () => {
        expect(evalPredicate3(band({ lo: "없는슬롯" }), item, look())).toBeUndefined();
    });

    it("없는 축도 모름", () => {
        expect(evalPredicate3({ kind: "axisBand", axisId: "없는축", band: { lo: "lo" } }, item, look())).toBeUndefined();
    });
});

describe("evalPredicate3 — 계산 축 값 구간", () => {
    const val = (from?: number, to?: number): FilterPredicate => ({
        kind: "axisValue",
        axisId: "c1",
        ranges: [{
            from: from === undefined ? undefined : { kind: "value", value: from },
            to: to === undefined ? undefined : { kind: "value", value: to },
        }],
    });

    it("구간 안이면 참, 밖이면 거짓", () => {
        expect(evalPredicate3(val(5, 10), item, look())).toBe(true);
        expect(evalPredicate3(val(8, 10), item, look())).toBe(false);
    });

    it("⚠ 값 결손은 **모름**이다 — 옛 필터는 탈락시켜 배치 진도를 성과로 착각하게 했다", () => {
        expect(evalPredicate3(val(5, 10), item, look({ axisValueOf: () => undefined }))).toBeUndefined();
    });

    it("앵커가 사라진 구간은 버리고, 남는 게 없으면 모름", () => {
        const anchored: FilterPredicate = {
            kind: "axisValue", axisId: "c1", ranges: [{ from: { kind: "point", point: "없는타점" } }],
        };
        expect(evalPredicate3(anchored, item, look())).toBeUndefined();
    });

    it("구간 여럿은 OR", () => {
        const p: FilterPredicate = {
            kind: "axisValue", axisId: "c1",
            ranges: [
                { from: { kind: "value", value: 100 }, to: { kind: "value", value: 200 } },
                { from: { kind: "value", value: 5 }, to: { kind: "value", value: 10 } },
            ],
        };
        expect(evalPredicate3(p, item, look())).toBe(true);
    });
});

describe("evalStage / toFunnelStages — 단계는 술어들의 AND", () => {
    const stage = (predicates: FilterPredicate[]): FilterStage => ({ id: "s1", enabled: true, predicates });

    it("하나라도 탈락이면 탈락 — 모름이 섞여 있어도", () => {
        const s = stage([
            { kind: "date", ranges: [{ from: "2020-01-01", to: "2020-12-31" }] },
            { kind: "axisBand", axisId: "없는축", band: { lo: "lo" } },
        ]);
        expect(evalStage(s, item, look())).toBe(false);
    });

    it("탈락이 없고 모름이 있으면 모름", () => {
        const s = stage([
            { kind: "date", ranges: [{ from: "2025-07-01", to: "2025-07-31" }] },
            { kind: "axisBand", axisId: "없는축", band: { lo: "lo" } },
        ]);
        expect(evalStage(s, item, look())).toBeUndefined();
    });

    it("core 깔때기가 먹는 모양으로 넘긴다", () => {
        const stages = [stage([{ kind: "group", expr: lit("g1") }])];
        const out = toFunnelStages(stages, look());
        expect(out[0].id).toBe("s1");
        expect(out[0].verdictOf(item)).toBe(true);
    });
});

describe("evalPredicate3 — 테마 강도 묶음", () => {
    // 단면: s(1,1)·m1(2,2) 존 안(30/40), 테마 T = {s, m1}.
    const section = {
        ranksOf: (code: string) => (({ s: { rate: 1, amount: 1 }, m1: { rate: 2, amount: 2 } }) as Record<string, { rate: number; amount: number }>)[code] ?? null,
    };
    const proj = {
        themesByCode: new Map([["s", ["T"]], ["m1", ["T"]]]),
        codesByTheme: new Map([["T", ["s", "m1"]]]),
    };
    const themed = (over: Partial<EvalLookup> = {}): EvalLookup =>
        look({ sectionRanksAt: () => section, themeProj: proj, ...over });
    const pred = (countMin: number): FilterPredicate => ({
        kind: "themeStrength",
        params: { zoneRateN: 30, zoneAmountN: 40, basis: "rate", countOn: true, countMin, baseRankOn: false, baseRankMax: 3, zoneRankOn: false, zoneRankMax: 2 },
    });
    const sItem: FunnelItem = { stockCode: "s", date: "2025-07-01", time: "09:21:00" };

    it("통과/탈락 — passesPoint 규약 그대로(자신 포함 셈)", () => {
        expect(evalPredicate3(pred(2), sItem, themed())).toBe(true);
        expect(evalPredicate3(pred(3), sItem, themed())).toBe(false);
    });

    it("시각 없는 항목(후보 하루)은 판단 불가 — 단면을 지목할 수 없다", () => {
        expect(evalPredicate3(pred(1), dayItem, themed())).toBeUndefined();
    });

    it("재료 미도착(테마 투영 null)·단면 없음(pending)은 판단 불가 — 탈락이 아니다", () => {
        expect(evalPredicate3(pred(1), sItem, themed({ themeProj: null }))).toBeUndefined();
        expect(evalPredicate3(pred(1), sItem, themed({ sectionRanksAt: () => null }))).toBeUndefined();
    });

    it("활성 하위 조건 0 = 빈 술어 = 무제한 통과", () => {
        const base = pred(1) as Extract<FilterPredicate, { kind: "themeStrength" }>;
        const off: FilterPredicate = { kind: "themeStrength", params: { ...base.params, countOn: false } };
        expect(evalPredicate3(off, sItem, themed({ themeProj: null }))).toBe(true); // 재료 없어도 — 조건이 없으니까
    });
});
