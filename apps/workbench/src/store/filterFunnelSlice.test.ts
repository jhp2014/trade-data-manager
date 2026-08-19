import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datePred, loadStore, stubStorage } from "../test/funnelStoreHarness.js";
import { selectFilterStages } from "./filterFunnelSlice.js";

// 필터 슬롯 슬라이스 — 이관·활성 슬롯 쓰기·시선(선택 칸) 정리 규칙.
// 저장 집합(저장·열기·덮어쓰기·삭제)은 savedSetsSlice.test 로 갈라져 있다.
//
// 옛 filterStages 는 저장 필드였다(슬롯과 손으로 맞추는 불변식) — 지금은 selectFilterStages 파생
// 하나다. 그래서 "소비자가 보는 한 벌 = 활성 슬롯"은 필드 동일성이 아니라 **선택자 계약**으로 잠근다.

beforeEach(() => {
    vi.resetModules();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("슬롯 로드·이관", () => {
    it("옛 단일 키(wb.filterStages)는 슬롯 1로 이관되고 나머지 칸은 빈다", async () => {
        stubStorage({ "wb.filterStages": [{ id: "s1", enabled: true, predicates: [datePred] }] });
        const store = await loadStore();
        const { FILTER_SLOT_COUNT } = await import("./filterFunnelSlice.js");
        const st = store.getState();
        expect(st.filterSlotIndex).toBe(0);
        expect(st.filterSlots).toHaveLength(FILTER_SLOT_COUNT);
        expect(selectFilterStages(st).map((s) => s.id)).toEqual(["s1"]);
        for (let i = 1; i < FILTER_SLOT_COUNT; i++) expect(st.filterSlots[i]).toEqual([]);
    });

    it("저장된 active 가 범위 밖이면 0으로 접는다(깨진 저장본이 빈 화면을 만들지 않게)", async () => {
        stubStorage({ "wb.filterSlots": { active: 7, slots: [[{ id: "s1", enabled: true, predicates: [datePred] }], [], []] } });
        const store = await loadStore();
        const st = store.getState();
        expect(st.filterSlotIndex).toBe(0);
        expect(selectFilterStages(st).map((s) => s.id)).toEqual(["s1"]);
    });
});

describe("편집은 활성 슬롯에만 쓴다", () => {
    it("슬롯 2로 갈아탄 뒤의 편집이 슬롯 1을 건드리지 않고, 영속에도 그대로 실린다", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().setFilterSlot(1);
        store.getState().addFilterStage([datePred]);
        const st = store.getState();
        expect(st.filterSlots[0]).toEqual([]);
        expect(st.filterSlots[1]).toHaveLength(1);
        expect(selectFilterStages(st)).toBe(st.filterSlots[1]); // 소비자가 보는 한 벌 = 활성 슬롯(선택자 계약)
        const saved = JSON.parse(storage.get("wb.filterSlots")!) as { active: number; slots: unknown[][] };
        expect(saved.active).toBe(1);
        expect(saved.slots[1]).toHaveLength(1);
        expect(saved.slots[0]).toEqual([]);
    });

    it("슬롯 전환은 이미 있던 그 벌을 돌려준다 — 선택자가 새 배열을 지어내지 않는다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const slot0 = store.getState().filterSlots[0];
        store.getState().setFilterSlot(1);
        expect(selectFilterStages(store.getState())).toBe(store.getState().filterSlots[1]);
        store.getState().setFilterSlot(0);
        expect(selectFilterStages(store.getState())).toBe(slot0); // 돌아오면 같은 참조 — 구독 메모가 안 헛돈다
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

    it("슬롯 전환은 조건 통째 교체라 시선을 푼다", async () => {
        const { store } = await withSelection();
        store.getState().setFilterSlot(2);
        expect(store.getState().funnelSelection).toBeNull();
    });
});

describe("선택 포인터 — 깔때기를 만지는 순간 작업 깔때기로 복귀한다", () => {
    it("목록 선택 후 단계 편집·칸 짚기·슬롯 전환이 전부 포인터를 푼다", async () => {
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

        store.getState().selectSet({ kind: "survivors" });
        store.getState().setFilterSlot(2); // 슬롯 전환
        expect(store.getState().selectedSetRef).toBeNull();
    });
});
