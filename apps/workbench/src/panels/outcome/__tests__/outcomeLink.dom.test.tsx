// 표시 T 의 단일 출처 — 연동 행의 T ?? 탐색 T, 그리고 **자리 충돌 거절**.
//
// 자리 충돌이 회귀선인 이유: 결과 레일 키가 (지표 × T) 라, 연동 조건의 T 를 다른 조건과 같은 자리로
// 옮기면 뒤 조건이 편집면에서 사라진 채 계속 필터링한다 — "이 레일에 뭘 그릴까"가 함수라는 근거가
// 그 한 경로에서만 깨진다(2026-09-09 리뷰 지적).
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWorkbench } from "../../../store/workbench.js";
import { OUTCOME_LINK_SCOPE, OUTCOME_T_KEY, OUTCOME_T_SCOPE, useLinkedOutcome } from "../outcomeLink.js";
import type { FilterPredicate } from "../../filter/stage.js";

const outPred = (metric: "extHigh" | "dropFromHigh", t: number): FilterPredicate => ({ kind: "outcome", metric, t, ranges: [] });

/** 결과 조건 행을 세우고 그 id 를 돌려준다(보드의 ＋조건과 같은 경로). */
const addOutcome = (metric: "extHigh" | "dropFromHigh", t: number): string => {
    act(() => { useWorkbench.getState().addFilterStage([outPred(metric, t)]); });
    const stages = useWorkbench.getState().filterStages;
    return stages[stages.length - 1]!.id;
};
const tOfStage = (id: string): number | undefined => {
    const p = useWorkbench.getState().filterStages.find((s) => s.id === id)?.predicates[0];
    return p?.kind === "outcome" ? p.t : undefined;
};

describe("표시 T — 연동 행의 T ?? 탐색 T", () => {
    beforeEach(() => {
        act(() => {
            useWorkbench.getState().clearFilterStages();
            useWorkbench.getState().setSessionUi(OUTCOME_T_SCOPE, OUTCOME_T_KEY, undefined);
            useWorkbench.getState().setSessionUi(OUTCOME_LINK_SCOPE, "stageId", undefined);
        });
    });

    it("조건이 없으면 탐색 T 가 기준이고, 커밋은 세션에만 남는다(조건을 만들지 않는다)", () => {
        const { result } = renderHook(() => useLinkedOutcome());
        expect(result.current.displayT).toBe(2); // 도메인 하한 = 기본
        act(() => { result.current.setDisplayT(9); });
        expect(result.current.displayT).toBe(9);
        expect(useWorkbench.getState().filterStages).toHaveLength(0);
    });

    it("조건이 서면 첫 행이 자동 연동되고 표시 T 가 그 조건의 T 를 따른다", () => {
        addOutcome("extHigh", 7);
        const { result } = renderHook(() => useLinkedOutcome());
        expect(result.current.linkedId).not.toBeNull();
        expect(result.current.displayT).toBe(7);
    });

    it("연동 조건이 있으면 T 커밋이 **그 조건의 T 를 옮긴다**", () => {
        const id = addOutcome("extHigh", 7);
        const { result } = renderHook(() => useLinkedOutcome());
        act(() => { result.current.setDisplayT(12); });
        expect(tOfStage(id)).toBe(12);
        expect(result.current.displayT).toBe(12);
        expect(result.current.conflictAt).toBeNull();
    });

    it("⚠ 같은 (지표, T) 자리로는 못 옮긴다 — 거절하고 사유를 남긴다(뒤 조건이 편집면에서 사라지는 사고)", () => {
        const a = addOutcome("extHigh", 5);
        addOutcome("extHigh", 10);
        act(() => { useWorkbench.getState().setSessionUi(OUTCOME_LINK_SCOPE, "stageId", a); });
        const { result } = renderHook(() => useLinkedOutcome());
        expect(result.current.displayT).toBe(5);
        act(() => { result.current.setDisplayT(10); });
        expect(tOfStage(a)).toBe(5); // 안 옮겨졌다
        expect(result.current.conflictAt).toBe(10);
    });

    it("지표가 다르면 같은 T 로 옮겨도 된다 — 자리가 (지표 × T) 라 충돌이 아니다", () => {
        const a = addOutcome("extHigh", 5);
        addOutcome("dropFromHigh", 10);
        act(() => { useWorkbench.getState().setSessionUi(OUTCOME_LINK_SCOPE, "stageId", a); });
        const { result } = renderHook(() => useLinkedOutcome());
        act(() => { result.current.setDisplayT(10); });
        expect(tOfStage(a)).toBe(10);
        expect(result.current.conflictAt).toBeNull();
    });
});
