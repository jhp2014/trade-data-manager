// 결과 열 접근자 — 정렬값이 셀 표기와 같은 출처(eval/slice)를 읽는지, 결손·무사건이 바닥(null)인지.
import { describe, expect, it } from "vitest";
import type { OutcomeRecord } from "../../../lib/useOutcomes.js";
import { OUTCOME_COL_IDS, OUTCOME_COL_META, fmtOutcomePct, isOutcomeColId, outcomeSortValue } from "../outcomeColumns.js";

/** 정렬이 읽는 부분(slice.status/recovered·eval)만 채운 레코드. */
const recOf = (over: { status?: "exceeded" | "contained" | "none"; recovered?: boolean | null; eval?: OutcomeRecord["eval"] }): OutcomeRecord =>
    ({ slice: { status: over.status ?? "exceeded", recovered: over.recovered ?? null }, eval: over.eval ?? {} }) as OutcomeRecord;

describe("결과 열 어휘", () => {
    it("열 6개 — @T2 열은 없다(Δ로 충분, 사용자 확정)·전부 메타가 있다", () => {
        expect(OUTCOME_COL_IDS).toEqual(["extHigh", "deltaExt", "dropFromHigh", "dropFromClose", "recovered", "status"]);
        for (const id of OUTCOME_COL_IDS) expect(OUTCOME_COL_META[id].label).not.toBe("");
    });
    it("isOutcomeColId — 죽은 id 는 거른다(정렬 영속 복원이 이 판정을 쓴다)", () => {
        expect(isOutcomeColId("extHigh")).toBe(true);
        expect(isOutcomeColId("status")).toBe(true);
        expect(isOutcomeColId("extHighT2")).toBe(false);
    });
});

describe("outcomeSortValue — null = 값 없음(방향 무관 바닥)", () => {
    it("레코드 없음(격자 미도착·day 행) → 전 열 null", () => {
        for (const id of OUTCOME_COL_IDS) expect(outcomeSortValue(undefined, id)).toBeNull();
    });
    it("숫자 4종 = eval 그대로(셀 표기와 같은 출처) · 무사건 낙폭은 null", () => {
        const rec = recOf({ eval: { extHigh: 12.3, deltaExt: 0 } });
        expect(outcomeSortValue(rec, "extHigh")).toBe(12.3);
        expect(outcomeSortValue(rec, "deltaExt")).toBe(0);
        expect(outcomeSortValue(rec, "dropFromHigh")).toBeNull(); // 무눌림의 무사건
    });
    it("상태 서수 = 초과 0 < 이내 1 < 무눌림 2(눌림이 얕아지는 방향)", () => {
        expect(outcomeSortValue(recOf({ status: "exceeded" }), "status")).toBe(0);
        expect(outcomeSortValue(recOf({ status: "contained" }), "status")).toBe(1);
        expect(outcomeSortValue(recOf({ status: "none" }), "status")).toBe(2);
    });
    it("회복 = true 1 · false 0 · 무눌림 null(대상 아님)", () => {
        expect(outcomeSortValue(recOf({ recovered: true }), "recovered")).toBe(1);
        expect(outcomeSortValue(recOf({ recovered: false }), "recovered")).toBe(0);
        expect(outcomeSortValue(recOf({ recovered: null }), "recovered")).toBeNull();
    });
});

describe("표기", () => {
    it("부호 붙은 % 한 자리 — 단위까지 글자에 싣는다(축 열과 같은 줄에 서므로)", () => {
        expect(fmtOutcomePct(12.34)).toBe("+12.3%");
        expect(fmtOutcomePct(-5.45)).toBe("-5.5%");
        expect(fmtOutcomePct(0)).toBe("0.0%");
    });
});
