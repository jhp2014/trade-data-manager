import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datePred, loadStore, stubStorage } from "../test/funnelStoreHarness.js";
import { selectFilterStages } from "./filterFunnelSlice.js";

// 필터 깔때기 슬라이스 — 조건 한 벌의 이관·영속·시선(선택 칸) 정리 규칙.
// 저장 집합(저장·열기·덮어쓰기·삭제)은 savedSetsSlice.test 로 갈라져 있다.
//
// 슬롯 3칸은 폐지됐다(집합 = 이름 붙은 슬롯이라 익명 칸이 할 일이 없었다) — 그래서 이관 시험이
// **두 갈래**다: 슬롯 저장본의 활성 칸, 그리고 슬롯 이전의 단일 벌.

beforeEach(() => {
    vi.resetModules();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("조건 한 벌 로드·이관", () => {
    it("슬롯 저장본은 **활성 칸 하나만** 이어받는다(나머지 칸은 이름이 없어 살릴 자리가 없다)", async () => {
        stubStorage({
            "wb.filterSlots": {
                active: 1,
                slots: [[{ id: "s0", enabled: true, predicates: [datePred] }], [{ id: "s1", enabled: true, predicates: [datePred] }], []],
            },
        });
        const store = await loadStore();
        expect(selectFilterStages(store.getState()).map((s) => s.id)).toEqual(["s1"]);
    });

    it("슬롯 이전의 단일 벌(wb.filterStages)도 그대로 이어받는다", async () => {
        stubStorage({ "wb.filterStages": [{ id: "s1", enabled: true, predicates: [datePred] }] });
        const store = await loadStore();
        expect(selectFilterStages(store.getState()).map((s) => s.id)).toEqual(["s1"]);
    });

    it("지금 키가 있으면 옛 키는 안 본다 — 이관은 한 번뿐이다", async () => {
        stubStorage({
            "wb.filterStages.v2": [{ id: "now", enabled: true, predicates: [datePred] }],
            "wb.filterSlots": { active: 0, slots: [[{ id: "old", enabled: true, predicates: [datePred] }], [], []] },
        });
        const store = await loadStore();
        expect(selectFilterStages(store.getState()).map((s) => s.id)).toEqual(["now"]);
    });
});

describe("편집은 곧 영속", () => {
    it("단계를 더하면 지금 키에 그대로 실린다", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        expect(selectFilterStages(store.getState())).toHaveLength(1);
        const saved = JSON.parse(storage.get("wb.filterStages.v2")!) as unknown[];
        expect(saved).toHaveLength(1);
    });
});

describe("시선(funnelSelection)은 활성 단계에만 성립한다", () => {
    /** 단계 하나 세우고 그 칸을 짚은 상태를 만든다. */
    async function withSelection(): Promise<{ store: Awaited<ReturnType<typeof loadStore>>; id: string }> {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = selectFilterStages(store.getState())[0].id;
        store.getState().setFunnelSelection({ stageId: id, cells: ["survive"] });
        return { store, id };
    }

    it("이름 변경·순서 이동은 시선을 유지한다(단계는 여전히 활성이다)", async () => {
        const { store, id } = await withSelection();
        store.getState().renameFilterStage(id, "새 이름");
        store.getState().moveFilterStage(0, 0);
        expect(store.getState().funnelSelection?.stageId).toBe(id);
    });

    it("술어를 전부 비우면 시선이 풀린다 — 경로별 수동 해제가 빠뜨리던 스테일", async () => {
        const { store, id } = await withSelection();
        store.getState().setFilterStagePredicates(id, []);
        expect(store.getState().funnelSelection).toBeNull();
    });

    it("단계를 끄면(toggle off) 시선이 풀린다 — 평가에서 빠진 단계의 칸은 존재하지 않는다", async () => {
        const { store, id } = await withSelection();
        store.getState().toggleFilterStage(id);
        expect(store.getState().funnelSelection).toBeNull();
    });

    it("단계 삭제·전체 비우기도 같은 규칙으로 풀린다", async () => {
        const { store, id } = await withSelection();
        store.getState().removeFilterStage(id);
        expect(store.getState().funnelSelection).toBeNull();

        store.getState().addFilterStage([datePred]);
        const id2 = selectFilterStages(store.getState())[0].id;
        store.getState().setFunnelSelection({ stageId: id2, cells: ["nearMiss"] });
        store.getState().clearFilterStages();
        expect(store.getState().funnelSelection).toBeNull();
    });
});

describe("선택 포인터 — 깔때기를 만지는 순간 작업 깔때기로 복귀한다", () => {
    it("집합 선택 후 단계 편집·칸 짚기가 전부 포인터를 푼다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = selectFilterStages(store.getState())[0].id;

        store.getState().selectSet({ kind: "universe" });
        expect(store.getState().selectedSetRef).toEqual({ kind: "universe" });
        store.getState().addFilterStage([datePred]); // 조건 편집
        expect(store.getState().selectedSetRef).toBeNull();

        store.getState().selectSet({ kind: "survivors" });
        store.getState().setFunnelSelection({ stageId: id, cells: ["survive"] }); // 칸 짚기
        expect(store.getState().selectedSetRef).toBeNull();
    });
});
