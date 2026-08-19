import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datePred, loadStore, stubStorage } from "../test/funnelStoreHarness.js";
import { selectFilterStages } from "./filterFunnelSlice.js";

// 저장 집합 슬라이스 — 저장(엎어쓰기)·이관·열기·덮어쓰기·삭제와 선택 포인터 정리.
// 작업 깔때기(슬롯·시선) 쪽 규칙은 filterFunnelSlice.test 에 있다.

beforeEach(() => {
    vi.resetModules();
});
afterEach(() => {
    vi.unstubAllGlobals();
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
        const id = selectFilterStages(store.getState())[0].id;
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
        expect(selectFilterStages(store.getState())).toHaveLength(1);

        store.getState().addFilterStage([datePred]); // 편집 — 저장물은 아직 1개 조건
        expect(store.getState().savedSets[0].stages).toHaveLength(1);

        store.getState().overwriteSet(id); // 명시적 덮어쓰기 — 이제 2개
        expect(store.getState().savedSets[0].stages).toHaveLength(2);
    });

    it("덮어쓰기는 부위를 유지한다 — 칸 집합을 열어 조건만 고쳐도 칸 집합으로 남는다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const stageId = selectFilterStages(store.getState())[0].id;
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

describe("삭제와 선택 포인터", () => {
    it("선택한 집합을 지우면 포인터가 풀린다 — 연동 패널 전부가 죽은 참조를 보게 두지 않는다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파");
        const id = store.getState().savedSets[0].id;
        store.getState().selectSet({ kind: "saved", setId: id });

        store.getState().deleteSet(id);
        expect(store.getState().selectedSetRef).toBeNull();
    });

    it("다른 집합을 지우는 건 포인터를 안 건드린다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파");
        store.getState().saveSet("눌림");
        const [a, b] = store.getState().savedSets;
        store.getState().selectSet({ kind: "saved", setId: a.id });

        store.getState().deleteSet(b.id);
        expect(store.getState().selectedSetRef).toEqual({ kind: "saved", setId: a.id });
    });
});
