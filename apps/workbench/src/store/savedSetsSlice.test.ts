import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exprOfStages, refsOf } from "../panels/filter/expr.js";
import { datePred, loadStore, stubStorage } from "../test/funnelStoreHarness.js";
import { selectEditingExpr, selectEditingStages, selectObservedExpr } from "./filterFunnelSlice.js";

// 저장 집합 슬라이스 — **편집이 곧 저장**인 모델(2026-09-20)의 규칙.
//
// 여기서 잠그는 것 넷:
//  ① 편집할 집합이 **반드시 하나는 있다**(잎이 최상위에 못 뜨므로).
//  ② 편집 = 저장 — 조건을 만지면 저장물이 **그 자리에서** 바뀐다(「저장 안 한 변경」이 없다).
//  ③ 편집 대상은 **영속**이고, 지워지면 첫 집합으로 내려앉는다.
//  ④ 옛 키는 안 읽는다(승계 없는 키 상향).

beforeEach(() => {
    vi.resetModules();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe("편집할 집합은 늘 하나 있다", () => {
    it("저장물이 비면 빈 집합 하나를 세우고 그걸 편집 대상으로 둔다", async () => {
        stubStorage();
        const store = await loadStore();
        expect(store.getState().savedSets).toHaveLength(1);
        expect(store.getState().editingSetId).toBe(store.getState().savedSets[0]!.id);
        expect(selectEditingExpr(store.getState()).of, "빈 식 — '제한 없음'이지 '전부 탈락'이 아니다").toEqual([]);
    });

    it("이름은 **안 짓는다** — 부재가 곧 자동 이름(점선 칩)", async () => {
        stubStorage();
        const store = await loadStore();
        expect(store.getState().savedSets[0]!.name).toBeUndefined();
    });

    it("옛 키(v5·v4·그 이전)는 읽지 않는다 — 승계 없는 키 상향", async () => {
        stubStorage({
            "wb.savedSets.v5": [{ id: "fs1", name: "괄호 이전", expr: exprOfStages([]), universe: "longitudinal" as const }],
            "wb.savedSets.v4": [{ id: "fs2", name: "식 트리 시절", expr: exprOfStages([]), universe: "longitudinal" as const }],
        });
        const store = await loadStore();
        expect(store.getState().savedSets.map((s) => s.name)).toEqual([undefined]);
    });

    it("지금 키(v6)는 그대로 읽는다", async () => {
        stubStorage({
            "wb.savedSets.v6": [{ id: "fs2", name: "새것", expr: exprOfStages([]), universe: "longitudinal" as const }],
        });
        const store = await loadStore();
        expect(store.getState().savedSets.map((s) => s.name)).toEqual(["새것"]);
    });
});

describe("편집 = 저장 — 「저장 안 한 변경」이라는 상태가 없다", () => {
    it("조건을 더하면 **편집 중인 집합의 저장물**이 그 자리에서 바뀐다", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);

        const id = store.getState().editingSetId;
        expect(selectEditingStages(store.getState())).toHaveLength(1);
        const raw = JSON.parse(storage.get("wb.savedSets.v6")!) as { id: string; expr: { of: unknown[] } }[];
        expect(raw.find((x) => x.id === id)!.expr.of, "저장물이 즉시 따라온다").toHaveLength(1);
    });

    it("편집 대상 갈아타기는 **사본을 안 뜬다** — 두 집합이 서로를 안 흔든다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().addFilterStage([datePred]);
        const first = store.getState().editingSetId;

        store.getState().createSet();
        const second = store.getState().editingSetId;
        expect(second).not.toBe(first);
        expect(selectEditingStages(store.getState()), "새 집합은 비어서 시작한다").toEqual([]);

        store.getState().addFilterStage([datePred]);
        store.getState().editSet(first);
        expect(selectEditingStages(store.getState()), "돌아오면 그 집합의 조건 그대로").toHaveLength(1);
    });

    it("편집 대상은 **영속**이다 — 새로고침 뒤 보던 집합으로 돌아온다", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        store.getState().createSet();
        const id = store.getState().editingSetId;
        expect(JSON.parse(storage.get("wb.editingSetId.v1")!)).toBe(id);
    });
});

describe("새 묶음 — 중첩이 사는 자리", () => {
    it("빈 집합을 만들어 지금 식에 참조로 붙이고, 그 집합으로 내려간다", async () => {
        stubStorage();
        const store = await loadStore();
        const outer = store.getState().editingSetId;

        store.getState().addGroupTerm();
        const inner = store.getState().editingSetId;
        expect(inner, "편집 대상이 새 집합으로 내려간다").not.toBe(outer);

        const outerExpr = store.getState().savedSets.find((x) => x.id === outer)!.expr;
        expect(refsOf(outerExpr), "바깥 식에는 참조 한 항이 남는다").toEqual([inner]);
    });
});

describe("삭제 — 깨진 참조는 표식을 달고 남는다", () => {
    it("편집 중이던 집합을 지우면 첫 집합으로 내려앉는다(빈 화면 금지)", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().createSet();
        const second = store.getState().editingSetId;

        store.getState().deleteSet(second);
        expect(store.getState().savedSets.some((x) => x.id === second)).toBe(false);
        expect(store.getState().editingSetId).toBe(store.getState().savedSets[0]!.id);
    });

    it("마지막 하나를 지워도 빈 집합이 다시 선다 — 편집할 집합은 늘 있다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().deleteSet(store.getState().editingSetId);
        expect(store.getState().savedSets).toHaveLength(1);
    });

    it("⚠ 참조하던 식은 **안 고친다** — 깨진 참조가 서는 게 규칙이다(조용히 넓어지지 않는다)", async () => {
        stubStorage();
        const store = await loadStore();
        const outer = store.getState().editingSetId;
        store.getState().addGroupTerm();
        const inner = store.getState().editingSetId;

        store.getState().deleteSet(inner);
        const outerExpr = store.getState().savedSets.find((x) => x.id === outer)!.expr;
        expect(refsOf(outerExpr), "참조는 그대로 — 리졸버가 '깨짐'으로 받는다").toEqual([inner]);
    });

    it("선택한 집합을 지우면 포인터가 풀린다 — 연동 패널 전부가 죽은 참조를 보게 두지 않는다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().createSet();
        const second = store.getState().editingSetId;
        store.getState().selectSet({ kind: "saved", setId: second });
        expect(store.getState().selectedSetRef).toEqual({ kind: "saved", setId: second });

        store.getState().deleteSet(second);
        expect(store.getState().selectedSetRef).toBeNull();
    });
});

describe("이름 — 손으로 지은 것만 충돌을 본다", () => {
    it("빈 이름 = 자동 이름으로 되돌리기(점선 칩)", async () => {
        stubStorage();
        const store = await loadStore();
        const id = store.getState().editingSetId;
        store.getState().renameSet(id, "  아침 돌파  ");
        expect(store.getState().savedSets[0]!.name).toBe("아침 돌파");
        store.getState().renameSet(id, "   ");
        expect(store.getState().savedSets[0]!.name).toBeUndefined();
    });

    it("손 이름끼리만 충돌 — 자동 이름(부재)은 비교에 안 걸린다", async () => {
        stubStorage();
        const store = await loadStore();
        const first = store.getState().editingSetId;
        store.getState().renameSet(first, "돌파");
        store.getState().createSet();
        const second = store.getState().editingSetId;

        store.getState().renameSet(second, "돌파"); // 충돌 — 무시
        expect(store.getState().savedSets.map((x) => x.name)).toEqual(["돌파", undefined]);
    });
});

// ⚠ 재사용의 유일한 손이다 — 이게 없으면 「쓰는 곳」이 영원히 0~1 이고 `hasCycle` 도 죽은 코드가 된다
//   (2026-09-20 리뷰가 "기능 미완인지 확인"으로 잡은 자리).
describe("기존 집합 붙이기 — 재사용과 순환 거절", () => {
    it("다른 집합을 참조 한 항으로 붙인다 — 쓰는 곳이 는다", async () => {
        stubStorage();
        const store = await loadStore();
        const a = store.getState().editingSetId;
        store.getState().createSet();
        const b = store.getState().editingSetId;

        store.getState().editSet(a);
        store.getState().addSetRef(b);
        expect(refsOf(selectEditingExpr(store.getState()))).toEqual([b]);
    });

    it("자기 자신·이미 붙은 것은 무시한다", async () => {
        stubStorage();
        const store = await loadStore();
        const a = store.getState().editingSetId;
        store.getState().createSet();
        const b = store.getState().editingSetId;
        store.getState().editSet(a);

        store.getState().addSetRef(a); // 자기 자신
        expect(refsOf(selectEditingExpr(store.getState()))).toEqual([]);
        store.getState().addSetRef(b);
        store.getState().addSetRef(b); // 두 번째는 무시
        expect(selectEditingExpr(store.getState()).of).toHaveLength(1);
    });

    it("**순환은 거절한다** — 저 집합이 건너서라도 나를 가리키면 안 붙는다", async () => {
        stubStorage();
        const store = await loadStore();
        const a = store.getState().editingSetId;
        store.getState().createSet();
        const b = store.getState().editingSetId;
        store.getState().addSetRef(a); // b → a

        store.getState().editSet(a);
        store.getState().addSetRef(b); // a → b 면 순환
        expect(refsOf(selectEditingExpr(store.getState())), "거절 — 식이 안 바뀐다").toEqual([]);
    });
});

// ── 관측은 경로의 뿌리다 (2026-09-21) ───────────────────────────────────────
//
// ⚠ 이 절이 없으면 아무도 이 분리를 못 잡는다 — 다른 검사는 전부 `editPath: [id]`(뿌리 = 편집 대상)
//   로 심어서 두 셀렉터가 같은 값을 낸다. 증상은 "오류 없이 화면이 먹통": 빈 묶음으로 내려가는
//   순간 관측 식이 비어 필터가 0 이 되고, 종단 전량이 구독 패널로 쏟아진다.
describe("편집 대상과 관측 대상", () => {
    it("묶음으로 내려가면 **편집만** 따라 내려가고 관측은 뿌리에 남는다", async () => {
        stubStorage();
        const store = await loadStore();
        const root = store.getState().editingSetId;
        store.getState().addFilterStage([datePred]);

        store.getState().addGroupTerm(); // 빈 묶음을 만들고 그리로 내려간다
        const inner = store.getState().editingSetId;
        expect(inner).not.toBe(root);

        expect(selectEditingExpr(store.getState()).of, "편집 대상은 갓 만든 빈 집합").toEqual([]);
        expect(selectObservedExpr(store.getState()).of.length, "관측은 뿌리 — 조건 + 참조 둘").toBe(2);
        expect(store.getState().editPath[0]).toBe(root);
    });

    // ⚠ 경로가 **세션**이면 새로고침 때 `[편집 대상]` 으로 재구성돼 내려가 있던 자식이 뿌리가 되고,
    //   그 집합이 비어 있으면 필터 0(= 제한 없음)이라 전 모수가 하류로 쏟아진다(먹통이던 그 자리).
    it("경로는 **영속**이다 — 새로고침해도 뿌리가 자식으로 바뀌지 않는다", async () => {
        const storage = stubStorage();
        const store = await loadStore();
        const root = store.getState().editingSetId;
        store.getState().addFilterStage([datePred]);
        store.getState().addGroupTerm();
        const inner = store.getState().editingSetId;
        expect(JSON.parse(storage.get("wb.editPath.v1")!)).toEqual([root, inner]);

        const again = await loadStore(); // 새로고침
        expect(again.getState().editPath, "경로가 그대로 선다").toEqual([root, inner]);
        expect(selectObservedExpr(again.getState()).of.length, "관측은 여전히 뿌리").toBe(2);
    });

    it("목록에서 다른 집합을 고르면 **새 뿌리**다 — 관측도 같이 옮겨간다", async () => {
        stubStorage();
        const store = await loadStore();
        store.getState().createSet();
        const second = store.getState().editingSetId;
        store.getState().addFilterStage([datePred]);
        expect(selectObservedExpr(store.getState())).toBe(selectEditingExpr(store.getState()));
        expect(store.getState().editPath).toEqual([second]);
    });
});
