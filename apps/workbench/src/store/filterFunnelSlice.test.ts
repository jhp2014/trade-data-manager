import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datePred, loadStore, stubStorage } from "../test/funnelStoreHarness.js";
import { selectFilterStages } from "./filterFunnelSlice.js";

// 필터 깔때기 슬라이스 — 조건 한 벌의 이관·영속·시선(선택 칸) 정리 규칙.
// 저장 집합(저장·열기·덮어쓰기·삭제)은 savedSetsSlice.test 로 갈라져 있다.
//
// 옛 키 이관은 v3 리셋(2026-08-23 골격 은퇴)에서 끊었다 — 은퇴한 골격 leaf 가 되살아나는 뒷문이라
// 옛 저장본(슬롯·v2·최초 키)은 읽지 않는다. 여기는 그 **안 읽음**을 잠근다.

beforeEach(() => {
    vi.resetModules();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("조건 한 벌 로드·이관", () => {
    it("옛 키(v1·리스트·슬롯·최초)는 읽지 않는다 — 2026-09-20 승계 없는 키 상향", async () => {
        stubStorage({
            "wb.filterExpr.v1": { kind: "and", id: "root", of: [{ kind: "cond", stage: { id: "old1", enabled: true, predicates: [datePred] } }] },
            "wb.filterStages.v4": [{ id: "old4", enabled: true, predicates: [datePred] }],
            "wb.filterStages": [{ id: "old0", enabled: true, predicates: [datePred] }],
            "wb.filterSlots": { active: 0, slots: [[{ id: "slot", enabled: true, predicates: [datePred] }], [], []] },
        });
        const store = await loadStore();
        expect(selectFilterStages(store.getState())).toEqual([]);
    });

    it("지금 키(v2)는 그대로 읽는다", async () => {
        stubStorage({ "wb.filterExpr.v2": { kind: "and", id: "root", of: [{ kind: "cond", stage: { id: "now", enabled: true, predicates: [datePred] } }] } });
        const store = await loadStore();
        expect(selectFilterStages(store.getState()).map((s) => s.id)).toEqual(["now"]);
    });
});

describe("편집은 곧 영속", () => {
    it("조건을 더하면 지금 키에 **식**으로 실린다 — 루트 AND 의 잎", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        expect(selectFilterStages(store.getState())).toHaveLength(1);
        const saved = JSON.parse(storage.get("wb.filterExpr.v2")!) as { kind: string; of: unknown[] };
        expect(saved.kind).toBe("and");
        expect(saved.of).toHaveLength(1);
    });
});

describe("선택 포인터 — 깔때기를 만지는 순간 작업 깔때기로 복귀한다", () => {
    it("집합 선택 후 단계 편집이 포인터를 푼다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = selectFilterStages(store.getState())[0].id;

        store.getState().selectSet({ kind: "universe" });
        expect(store.getState().selectedSetRef).toEqual({ kind: "universe" });
        store.getState().addFilterStage([datePred]); // 조건 편집
        expect(store.getState().selectedSetRef).toBeNull();

        store.getState().selectSet({ kind: "survivors" });
        store.getState().toggleFilterStage(id); // 조건 끄기도 편집이다
        expect(store.getState().selectedSetRef).toBeNull();
    });
});

// 리스트 편집 연산을 지운 뒤(2026-09-19) **이름 규칙의 유일한 구현**은 이 액션이다 — 옛 stage.ts
// `renameStage` 가 같은 규칙을 한 벌 더 들고 있었고, 두 벌이면 언젠가 한쪽만 고쳐진다.
describe("조건 개명 — 빈 이름은 자동 라벨로 되돌린다", () => {
    it("공백은 다듬고, 전부 공백이면 이름을 지운다(undefined = 자동 라벨)", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const id = selectFilterStages(store.getState())[0]!.id;

        store.getState().renameFilterStage(id, "  돌파  ");
        expect(selectFilterStages(store.getState())[0]!.name).toBe("돌파");
        store.getState().renameFilterStage(id, "   ");
        expect(selectFilterStages(store.getState())[0]!.name).toBeUndefined();
    });
});
