import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datePred, loadStore, stubStorage } from "../test/funnelStoreHarness.js";
import { selectFilterStages } from "./filterFunnelSlice.js";

// 저장 집합 슬라이스 — 저장(엎어쓰기)·이관·열기·덮어쓰기·삭제와 선택 포인터 정리.
// 작업 깔때기(조건 한 벌·시선) 쪽 규칙은 filterFunnelSlice.test 에 있다.

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

        const saved = JSON.parse(storage.get("wb.savedSets.v2")!) as { id: string }[];
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

    it("옛 키(wb.savedSets·wb.filterFunnelSets)는 읽지 않는다 — v2 리셋(골격 leaf 부활 금지)", async () => {
        stubStorage({
            "wb.filterFunnelSets": [{ id: "fs1", name: "깔때기 시절", stages: [] }],
            "wb.savedSets": [{ id: "fs2", name: "v1 시절", stages: [], part: { kind: "survivors" } }],
        });
        const store = await loadStore();
        expect(store.getState().savedSets).toEqual([]);
    });

    it("지금 키(v2)는 그대로 읽는다", async () => {
        stubStorage({
            "wb.savedSets.v2": [{ id: "fs2", name: "새것", stages: [], part: { kind: "survivors" } }],
        });
        const store = await loadStore();
        expect(store.getState().savedSets.map((s) => s.name)).toEqual(["새것"]);
    });
});

describe("자립 저장물 — 열기·덮어쓰기·삭제", () => {
    it("열기 = 조건 사본이 작업 깔때기로. 이후 편집은 저장물을 안 흔들고, 덮어쓰기가 그 집합 하나만 갱신한다", async () => {
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

    it("그 집합을 지우면 '열어 둔 집합'이 풀린다 — 덮어쓰기 버튼이 없는 것을 가리키면 안 된다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().saveSet("돌파");
        const id = store.getState().savedSets[0].id;
        expect(store.getState().openedSetId).toBe(id); // 저장 직후 = 열어 둔 것

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

describe("저장 집합 — 타점 정의 payload (additive, 키 상향 없음)", () => {
    it("저장은 현재 정의의 사본을 싣고, 열기는 그 집합의 것으로 되돌린다(같은 영속 경로)", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        store.getState().setPointDef({ renewalGateEok: 60 });
        store.getState().saveSet("게이트60");
        const id = store.getState().savedSets[0].id;
        expect(store.getState().savedSets[0].pointDef?.renewalGateEok).toBe(60);

        // 정의를 딴 값으로 바꿨다가 열면 집합의 사본으로 복귀 + localStorage(같은 영속 경로)에도 반영.
        store.getState().setPointDef({ renewalGateEok: 30 });
        store.getState().openSet(id);
        expect(store.getState().pointDef.renewalGateEok).toBe(60);
        expect(JSON.parse(storage.get("wb.pointDef.v1")!).renewalGateEok).toBe(60);
    });

    it("옛 저장물(정의 없음)은 살아남고, 열어도 현재 정의를 유지한다", async () => {
        const storage = stubStorage();
        const store0 = await loadStore();
        store0.getState().addFilterStage([datePred]);
        store0.getState().saveSet("옛집합");
        // 저장물에서 새 필드를 지워 "옛 포맷"을 흉내낸다.
        const raw = JSON.parse(storage.get("wb.savedSets.v2")!) as Record<string, unknown>[];
        for (const f of raw) {
            delete f.pointDef;
        }
        storage.set("wb.savedSets.v2", JSON.stringify(raw));

        vi.resetModules();
        const store = await loadStore();
        expect(store.getState().savedSets).toHaveLength(1); // 통째 폐기되지 않는다
        store.getState().setPointDef({ baselineGateEok: 70 });
        store.getState().openSet(store.getState().savedSets[0].id);
        expect(store.getState().pointDef.baselineGateEok).toBe(70); // 현재 유지
    });

    it("오염된 pointDef 는 필드만 생략된다 — 집합 통째 폐기 사유가 아니다", async () => {
        const storage = stubStorage();
        const store0 = await loadStore();
        store0.getState().addFilterStage([datePred]);
        store0.getState().saveSet("오염");
        const raw = JSON.parse(storage.get("wb.savedSets.v2")!) as Record<string, unknown>[];
        raw[0].pointDef = "garbage";
        storage.set("wb.savedSets.v2", JSON.stringify(raw));

        vi.resetModules();
        const store = await loadStore();
        expect(store.getState().savedSets).toHaveLength(1);
        expect(store.getState().savedSets[0].pointDef).toBeUndefined();
    });
});
