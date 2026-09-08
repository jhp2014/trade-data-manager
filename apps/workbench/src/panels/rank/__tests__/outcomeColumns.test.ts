// 결과 열 접근자 — 정렬값이 셀 표기와 같은 출처(eval/slice/SimResult)를 읽는지, 결손·무사건이 바닥(null)인지.
import { describe, expect, it } from "vitest";
import type { SimResult } from "@trade-data-manager/market/domain";
import type { OutcomeRecord } from "../../../lib/useOutcomes.js";
import { OUTCOME_BASE_COL_IDS, OUTCOME_COL_IDS, OUTCOME_COL_META, SIM_COL_IDS, fmtOutcomePct, isOutcomeColId, outcomeSortValue } from "../outcomeColumns.js";

/** 정렬이 읽는 부분(slice.status/recovered·eval)만 채운 레코드. */
const recOf = (over: { status?: "exceeded" | "contained" | "none"; recovered?: boolean | null; eval?: OutcomeRecord["eval"] }): OutcomeRecord =>
    ({ slice: { status: over.status ?? "exceeded", recovered: over.recovered ?? null }, eval: over.eval ?? {} }) as OutcomeRecord;

const simOf = (over: Partial<SimResult>): SimResult =>
    ({ status: "take", entryPrice: 9700, entryMin: 520, peakPct: null, troughPct: null, requiredPct: null, missedRisePct: null, ...over });

describe("결과 열 어휘", () => {
    it("결과 걷기 6 + 시뮬 4 — @T2 열은 없다(Δ로 충분)·전부 메타가 있다", () => {
        expect(OUTCOME_BASE_COL_IDS).toEqual(["extHigh", "dropFromHigh", "dropFromClose", "recovered", "status"]);
        expect(OUTCOME_COL_IDS).toEqual([...OUTCOME_BASE_COL_IDS, ...SIM_COL_IDS]);
        for (const id of OUTCOME_COL_IDS) expect(OUTCOME_COL_META[id].label).not.toBe("");
    });
    it("isOutcomeColId — 죽은 id 는 거른다(정렬 영속 복원이 이 판정을 쓴다)", () => {
        expect(isOutcomeColId("extHigh")).toBe(true);
        expect(isOutcomeColId("status")).toBe(true);
        expect(isOutcomeColId("simPeak")).toBe(true);
        expect(isOutcomeColId("extHighT2")).toBe(false);
    });
});

describe("outcomeSortValue — null = 값 없음(방향 무관 바닥)", () => {
    it("레코드 없음(격자 미도착·day 행) → 전 열 null", () => {
        for (const id of OUTCOME_COL_IDS) expect(outcomeSortValue(undefined, undefined, id)).toBeNull();
    });
    it("숫자 4종 = eval 그대로(셀 표기와 같은 출처) · 무사건 낙폭은 null", () => {
        const rec = recOf({ eval: { extHigh: 12.3, dropFromClose: 0 } });
        expect(outcomeSortValue(rec, undefined, "extHigh")).toBe(12.3);
        expect(outcomeSortValue(rec, undefined, "dropFromClose")).toBe(0);
        expect(outcomeSortValue(rec, undefined, "dropFromHigh")).toBeNull(); // 무눌림의 무사건
    });
    it("상태 서수 = 초과 0 < 이내 1 < 무눌림 2(눌림이 얕아지는 방향)", () => {
        expect(outcomeSortValue(recOf({ status: "exceeded" }), undefined, "status")).toBe(0);
        expect(outcomeSortValue(recOf({ status: "contained" }), undefined, "status")).toBe(1);
        expect(outcomeSortValue(recOf({ status: "none" }), undefined, "status")).toBe(2);
    });
    it("회복 = true 1 · false 0 · 무눌림 null(대상 아님)", () => {
        expect(outcomeSortValue(recOf({ recovered: true }), undefined, "recovered")).toBe(1);
        expect(outcomeSortValue(recOf({ recovered: false }), undefined, "recovered")).toBe(0);
        expect(outcomeSortValue(recOf({ recovered: null }), undefined, "recovered")).toBeNull();
    });
    it("시뮬 열 — 서수는 비관→낙관(손절 0 … 익절 5), 숫자는 SimResult 그대로, 미정의 브랜치 null", () => {
        expect(outcomeSortValue(undefined, simOf({ status: "stop" }), "simStatus")).toBe(0);
        expect(outcomeSortValue(undefined, simOf({ status: "expired" }), "simStatus")).toBe(1);
        expect(outcomeSortValue(undefined, simOf({ status: "cancelled" }), "simStatus")).toBe(2);
        expect(outcomeSortValue(undefined, simOf({ status: "shallow" }), "simStatus")).toBe(3);
        expect(outcomeSortValue(undefined, simOf({ status: "open" }), "simStatus")).toBe(4);
        expect(outcomeSortValue(undefined, simOf({ status: "take" }), "simStatus")).toBe(5);
        expect(outcomeSortValue(undefined, simOf({ peakPct: 9.3, requiredPct: 3 }), "simPeak")).toBe(9.3);
        expect(outcomeSortValue(undefined, simOf({ requiredPct: -2.5 }), "simRequired")).toBe(-2.5);
        expect(outcomeSortValue(undefined, simOf({}), "simTrough")).toBeNull(); // 익절 분기의 미정의 브랜치
        expect(outcomeSortValue(recOf({}), undefined, "simStatus")).toBeNull(); // 시뮬 레코드 없음 = 바닥
    });
});

describe("표기", () => {
    it("부호 붙은 % 한 자리 — 단위까지 글자에 싣는다(축 열과 같은 줄에 서므로)", () => {
        expect(fmtOutcomePct(12.34)).toBe("+12.3%");
        expect(fmtOutcomePct(-5.45)).toBe("-5.5%");
        expect(fmtOutcomePct(0)).toBe("0.0%");
    });
});
