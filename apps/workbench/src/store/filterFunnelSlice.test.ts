import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterPredicate } from "../panels/filter/stage.js";

// 필터 슬롯 슬라이스 — 이관·활성 슬롯 쓰기·시선(선택 칸) 정리 규칙.
//
// 슬라이스는 **모듈 로드 시점**에 localStorage 를 읽어 초기 슬롯을 만들므로, 테스트마다
// ① 스토리지 스텁을 먼저 깔고 ② 모듈을 새로 불러온다(vi.resetModules + 동적 import).
// 스토어 통째 로드는 의도다 — put·loadSlots 는 비공개 함수라, 계약은 액션 단위로만 잠근다.

function stubStorage(seed: Record<string, unknown> = {}): Map<string, string> {
    const m = new Map<string, string>(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
    vi.stubGlobal("localStorage", {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => void m.set(k, v),
        removeItem: (k: string) => void m.delete(k),
    });
    return m;
}

async function loadStore(): Promise<typeof import("./workbench.js")["useWorkbench"]> {
    return (await import("./workbench.js")).useWorkbench;
}

/** 비어 있지 않은 술어 한 벌 — 사전(그룹·축) 없이도 활성 판정이 서는 date 를 쓴다. */
const datePred: FilterPredicate = { kind: "date", ranges: [{ from: "2026-01-01", to: "2026-01-31" }] };

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
        expect(st.filterStages.map((s) => s.id)).toEqual(["s1"]);
        for (let i = 1; i < FILTER_SLOT_COUNT; i++) expect(st.filterSlots[i]).toEqual([]);
    });

    it("저장된 active 가 범위 밖이면 0으로 접는다(깨진 저장본이 빈 화면을 만들지 않게)", async () => {
        stubStorage({ "wb.filterSlots": { active: 7, slots: [[{ id: "s1", enabled: true, predicates: [datePred] }], [], []] } });
        const store = await loadStore();
        const st = store.getState();
        expect(st.filterSlotIndex).toBe(0);
        expect(st.filterStages.map((s) => s.id)).toEqual(["s1"]);
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
        expect(st.filterStages).toBe(st.filterSlots[1]); // 소비자가 보는 한 벌 = 활성 슬롯
        const saved = JSON.parse(storage.get("wb.filterSlots")!) as { active: number; slots: unknown[][] };
        expect(saved.active).toBe(1);
        expect(saved.slots[1]).toHaveLength(1);
        expect(saved.slots[0]).toEqual([]);
    });
});

describe("시선(funnelSelection)은 활성 단계에만 성립한다", () => {
    /** 단계 하나 세우고 그 칸을 짚은 상태를 만든다. */
    async function withSelection(): Promise<{ store: Awaited<ReturnType<typeof loadStore>>; id: string }> {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = store.getState().filterStages[0].id;
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
        const id2 = store.getState().filterStages[0].id;
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

describe("저장 집합 — 같은 이름은 엎어쓴다(같은 이름 = 같은 물건)", () => {
    it("첫 저장은 새 항목, 같은 이름 재저장은 id 를 지키고 정의만 갈린다", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파 조건");
        const first = store.getState().savedSets;
        expect(first).toHaveLength(1);
        const id = first[0].id;

        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파 조건");
        const again = store.getState().savedSets;
        expect(again).toHaveLength(1); // 새 항목이 아니라 엎어쓰기
        expect(again[0].id).toBe(id); // 바인딩 참조(id)가 새 정의를 따라온다
        expect(again[0].stages).toHaveLength(2);

        const saved = JSON.parse(storage.get("wb.savedSets")!) as { id: string }[];
        expect(saved).toHaveLength(1);
    });

    it("이름 앞뒤 공백은 깎는다 — '돌파 '와 '돌파'가 딴 물건이 되지 않게", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파");
        store.getState().saveSet(" 돌파 ");
        expect(store.getState().savedSets).toHaveLength(1);
    });

    it("부위는 저장하는 순간의 시선에서 온다 — 칸을 짚고 저장하면 그 칸이 집합의 정체가 된다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = store.getState().filterStages[0].id;
        store.getState().saveSet("생존");
        expect(store.getState().savedSets[0].part).toEqual({ kind: "survivors" });

        store.getState().setFunnelSelection({ stageId: id, cells: ["nearMiss"] });
        store.getState().saveSet("아깝게");
        const cellSet = store.getState().savedSets.find((s) => s.name === "아깝게")!;
        expect(cellSet.part).toEqual({ kind: "cell", stageId: id, cells: ["nearMiss"] });
    });

    it("옛 '저장한 깔때기'(wb.filterFunnelSets)는 부위=생존자인 집합으로 id 를 지키며 이관된다", async () => {
        stubStorage({
            "wb.filterFunnelSets": [{ id: "fs1", name: "돌파", stages: [{ id: "s1", enabled: true, predicates: [datePred] }] }],
        });
        const store = await loadStore();
        const sets = store.getState().savedSets;
        expect(sets).toHaveLength(1);
        expect(sets[0]).toMatchObject({ id: "fs1", name: "돌파", part: { kind: "survivors" } });
    });

    it("새 키가 있으면 옛 키는 안 읽는다 — 이관은 한 방향이다", async () => {
        stubStorage({
            "wb.filterFunnelSets": [{ id: "fs1", name: "옛것", stages: [] }],
            "wb.savedSets": [{ id: "fs2", name: "새것", stages: [], part: { kind: "survivors" } }],
        });
        const store = await loadStore();
        expect(store.getState().savedSets.map((s) => s.name)).toEqual(["새것"]);
    });
});

describe("자립 저장물 — 열기·덮어쓰기·삭제", () => {
    it("열기 = 조건 사본이 활성 슬롯으로. 이후 편집은 저장물을 안 흔들고, 덮어쓰기가 그 집합 하나만 갱신한다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파");
        const id = store.getState().savedSets[0].id;
        store.getState().clearFilterStages();

        store.getState().openSet(id);
        expect(store.getState().openedSetId).toBe(id);
        expect(store.getState().filterStages).toHaveLength(1);

        store.getState().addFilterStage([datePred]); // 편집 — 저장물은 아직 1개 조건
        expect(store.getState().savedSets[0].stages).toHaveLength(1);

        store.getState().overwriteSet(id); // 명시적 덮어쓰기 — 이제 2개
        expect(store.getState().savedSets[0].stages).toHaveLength(2);
    });

    it("덮어쓰기는 부위를 유지한다 — 칸 집합을 열어 조건만 고쳐도 칸 집합으로 남는다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const stageId = store.getState().filterStages[0].id;
        store.getState().setFunnelSelection({ stageId, cells: ["fail"] });
        store.getState().saveSet("탈락");
        const id = store.getState().savedSets[0].id;

        store.getState().openSet(id);
        store.getState().addFilterStage([datePred]);
        store.getState().overwriteSet(id);
        expect(store.getState().savedSets[0].part).toEqual({ kind: "cell", stageId, cells: ["fail"] });
    });

    it("슬롯 전환·그 집합 삭제는 '열어 둔 집합'을 푼다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파");
        const id = store.getState().savedSets[0].id;
        expect(store.getState().openedSetId).toBe(id); // 저장 직후 = 열어 둔 것

        store.getState().setFilterSlot(1);
        expect(store.getState().openedSetId).toBeNull();

        store.getState().setFilterSlot(0);
        store.getState().openSet(id);
        store.getState().deleteSet(id);
        expect(store.getState().openedSetId).toBeNull();
    });
});

describe("선택 포인터 — 깔때기를 만지는 순간 작업 깔때기로 복귀한다", () => {
    it("목록 선택 후 단계 편집·칸 짚기·슬롯 전환이 전부 포인터를 푼다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = store.getState().filterStages[0].id;

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
