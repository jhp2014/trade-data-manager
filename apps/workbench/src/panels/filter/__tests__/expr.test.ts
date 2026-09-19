// 식 트리(순수)의 계약 — 2026-09-19 「집합 편성 재설계」 5단계.
//
// 여기서 재는 건 셋이다:
//   ① **투영의 참조 안정성** — zustand 셀렉터가 매번 새 배열을 내면 스토어의 모든 갱신이 소비자
//      20여 곳을 깨운다(시트 전량 재정렬로 번졌던 그 사고). 이 파일의 첫 검사가 그 방어선이다.
//   ② **id 승계** — 잎의 주소는 옛 `stage.id` 그대로다. 새로 뽑으면 시트 결과 열·급타점 축·테마
//      연동이 주소를 잃고 첫 실행에 조용히 영구 삭제된다.
//   ③ **잎 단위 관대** — 잎 하나가 깨져도 집합 전체가 증발하지 않는다.
import { describe, it, expect } from "vitest";
import {
    activeExpr, addLeafAt, appendLeaf, emptyExpr, exprOfStages, filterLeaves, hasCycle, leafCount, leavesOf,
    mapLeaves, parseExpr, refNode, refsOf, removeNode,
    type SetExpr,
} from "../expr.js";
import { newStage, parseStages, type FilterStage } from "../stage.js";

const datePred = { kind: "date" as const, ranges: [{ from: "2026-07-01", to: "2026-07-31" }] };
const stage = (id: string, enabled = true, predicates: FilterStage["predicates"] = [datePred]): FilterStage =>
    ({ id, enabled, predicates });

describe("leavesOf — 평평한 목록을 읽는 소비자의 투영", () => {
    it("표시 순서 그대로", () => {
        const e = exprOfStages([stage("a"), stage("b"), stage("c")]);
        expect(leavesOf(e).map((s) => s.id)).toEqual(["a", "b", "c"]);
    });

    it("묶음 안쪽도 순서대로 편다", () => {
        const e: SetExpr = {
            kind: "and", id: "root",
            of: [
                { kind: "cond", stage: stage("a") },
                { kind: "or", id: "n1", of: [{ kind: "cond", stage: stage("b") }, { kind: "cond", stage: stage("c") }] },
            ],
        };
        expect(leavesOf(e).map((s) => s.id)).toEqual(["a", "b", "c"]);
    });

    // ⚠ 이 검사가 이 파일의 존재 이유다 — 없으면 셀렉터가 매 호출 새 배열을 내고 얕은 비교가 늘 실패한다.
    it("같은 식이면 **같은 배열**을 돌려준다 — 셀렉터 얕은 비교가 성립해야 한다", () => {
        const e = exprOfStages([stage("a")]);
        expect(leavesOf(e)).toBe(leavesOf(e));
    });

    it("식이 바뀌면 새 배열 — 캐시가 낡지 않는다", () => {
        const e = exprOfStages([stage("a")]);
        const next = appendLeaf(e, stage("b"));
        expect(leavesOf(next)).not.toBe(leavesOf(e));
        expect(leavesOf(next).map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("leafCount 는 leavesOf().length 와 같다(배열을 안 만드는 판)", () => {
        const e = exprOfStages([stage("a"), stage("b")]);
        expect(leafCount(e)).toBe(leavesOf(e).length);
    });
});

describe("편집 — 안 바뀐 가지는 참조가 유지된다", () => {
    it("mapLeaves: 아무것도 안 바뀌면 식 자체가 같은 객체", () => {
        const e = exprOfStages([stage("a"), stage("b")]);
        expect(mapLeaves(e, (s) => s)).toBe(e);
    });

    it("mapLeaves: 바뀐 잎만 새 객체 — 형제는 그대로", () => {
        const e = exprOfStages([stage("a"), stage("b")]);
        const next = mapLeaves(e, (s) => (s.id === "a" ? { ...s, enabled: false } : s));
        expect(next).not.toBe(e);
        expect(leavesOf(next)[1]).toBe(leavesOf(e)[1]); // b 는 같은 객체
    });

    it("filterLeaves: 빈 묶음은 접히고 루트는 남는다", () => {
        const e: SetExpr = {
            kind: "and", id: "root",
            of: [
                { kind: "cond", stage: stage("a") },
                { kind: "or", id: "n1", of: [{ kind: "cond", stage: stage("b") }] },
            ],
        };
        const next = filterLeaves(e, (s) => s.id !== "b");
        expect(next.kind).toBe("and");
        expect(leavesOf(next).map((s) => s.id)).toEqual(["a"]);
        // 잎이 없어진 OR 껍데기가 남지 않는다
        expect(JSON.stringify(next)).not.toContain("\"or\"");
    });

    it("filterLeaves: 전부 걸러내도 빈 루트가 남는다 — 붙이기·비우기가 늘 성립하게", () => {
        const next = filterLeaves(exprOfStages([stage("a")]), () => false);
        expect(next).toEqual(emptyExpr());
    });
});

describe("activeExpr — 끄기는 결손이 아니라 **부재**다", () => {
    it("꺼진 잎·빈 술어 잎은 평가에서 빠진다", () => {
        const e = exprOfStages([stage("on"), stage("off", false), stage("empty", true, [])]);
        expect(leavesOf(activeExpr(e)).map((s) => s.id)).toEqual(["on"]);
    });

    // OR 에서 빼면 **조여진다** — 그게 "지우지 않고 빼보기"가 뜻하는 것이다(재료가 없어 판단 못 하는
    // 결손과 다르다. 저건 평가 안에서 and3/or3 가 3치로 받는다).
    it("OR 안의 잎을 끄면 그 가지만 남는다", () => {
        const e: SetExpr = {
            kind: "and", id: "root",
            of: [{ kind: "or", id: "n1", of: [{ kind: "cond", stage: stage("a") }, { kind: "cond", stage: stage("b", false) }] }],
        };
        expect(leavesOf(activeExpr(e)).map((s) => s.id)).toEqual(["a"]);
    });
});

describe("파싱 — 잎 단위로 관대하다", () => {
    const round = (e: SetExpr): SetExpr | null => parseExpr(JSON.parse(JSON.stringify(e)), parseStages);

    it("왕복 항등 — 부정 수식어까지", () => {
        const e: SetExpr = {
            kind: "and", id: "root",
            of: [
                { kind: "cond", stage: stage("a"), neg: true },
                { kind: "or", id: "n1", neg: true, of: [{ kind: "cond", stage: stage("b") }] },
            ],
        };
        expect(round(e)).toEqual(e);
    });

    it("부정 부재는 필드 없이 읽힌다 — 옛 저장물이 필드 추가 없이 승계된다", () => {
        const e = exprOfStages([stage("a")]);
        expect(round(e)).toEqual(e);
        expect(JSON.stringify(round(e))).not.toContain("neg");
    });

    // ⚠ parseStages 는 술어 하나만 못 읽어도 저장본을 통째 버린다 — 그 성질을 트리가 물려받으면
    //   잎 하나에 집합 전체가 증발한다. 여기서 그 회귀가 잡힌다.
    it("못 읽는 잎만 떨어지고 나머지는 산다", () => {
        const broken = { kind: "and", id: "root", of: [
            { kind: "cond", stage: stage("a") },
            { kind: "cond", stage: { id: "bad", enabled: true, predicates: [{ kind: "없는술어" }] } },
            { kind: "cond", stage: stage("c") },
        ] };
        const e = parseExpr(broken, parseStages);
        expect(e).not.toBeNull();
        expect(leavesOf(e!).map((s) => s.id)).toEqual(["a", "c"]);
    });

    it("잎 하나짜리 루트는 AND 로 감싼다 — 붙이기가 늘 성립하게", () => {
        const e = parseExpr({ kind: "cond", stage: stage("a") }, parseStages);
        expect(e?.kind).toBe("and");
        expect(leavesOf(e!).map((s) => s.id)).toEqual(["a"]);
    });

    it("묶음 id 가 없으면 발급한다(옛/손으로 쓴 저장물)", () => {
        const e = parseExpr({ kind: "and", of: [] }, parseStages);
        expect(e?.kind).toBe("and");
        expect((e as { id: string }).id).not.toBe("");
    });

    it("모양이 아예 아니면 null — 호출부가 옛 키로 떨어질 수 있게", () => {
        expect(parseExpr(null, parseStages)).toBeNull();
        expect(parseExpr({ kind: "없음" }, parseStages)).toBeNull();
    });
});

describe("승계 — 평평한 리스트는 루트 AND 가 되고 **id 는 그대로**다", () => {
    // 잎 id 를 새로 뽑으면 시트 인스턴스 결과 열(out:i:<id>)·급타점 축(c:hot:<id>)·테마 연동이
    // 주소를 잃고, 유령 청소가 저장물 기준이라 열 설정이 첫 실행에 영구 삭제된다.
    it("잎 id = 옛 stage.id", () => {
        const stages = [stage("s1"), stage("s2")];
        const e = exprOfStages(stages);
        expect(e.kind).toBe("and");
        expect(leavesOf(e).map((s) => s.id)).toEqual(["s1", "s2"]);
        expect(leavesOf(e)[0]).toBe(stages[0]); // 단계 객체 자체가 그대로 실린다
    });

    it("빈 리스트 = 빈 루트(조건 0개 — '제한 없음'이지 '전부 탈락'이 아니다)", () => {
        expect(exprOfStages([])).toEqual(emptyExpr());
    });
});

// ── 8단계: 참조 잎 ────────────────────────────────────────────────────────
describe("참조 잎 — 이름이 곧 중첩의 수단", () => {
    const ref = (setId: string): SetExpr => ({ kind: "ref", id: `n-${setId}`, setId });

    // ⚠ 참조를 잎으로 세면 "이 집합의 조건 N개"가 남의 조건까지 세고, 편집면이 남의 것을 만진다.
    it("참조는 조건 목록에 안 든다 — 내용이 남의 것이다", () => {
        const e: SetExpr = { kind: "and", id: "root", of: [{ kind: "cond", stage: stage("a") }, ref("fs1")] };
        expect(leavesOf(e).map((s) => s.id)).toEqual(["a"]);
        expect(leafCount(e)).toBe(1);
    });

    it("refsOf — 쓰는 집합 id 를 중복 없이 모은다", () => {
        const e: SetExpr = { kind: "or", id: "root", of: [ref("fs1"), ref("fs2"), ref("fs1")] };
        expect(refsOf(e).sort()).toEqual(["fs1", "fs2"]);
    });

    it("왕복 항등 — 부정된 참조까지", () => {
        const e: SetExpr = { kind: "and", id: "root", of: [{ ...ref("fs1"), neg: true }] };
        expect(parseExpr(JSON.parse(JSON.stringify(e)), parseStages)).toEqual(e);
    });

    it("setId 가 없거나 빈 참조는 그 잎만 떨어진다(잎 단위 관대)", () => {
        const e = parseExpr({ kind: "and", id: "root", of: [{ kind: "ref", id: "n1" }, { kind: "cond", stage: stage("a") }] }, parseStages);
        expect(leavesOf(e!).map((s) => s.id)).toEqual(["a"]);
        expect(refsOf(e!)).toEqual([]);
    });

    it("삭제·필터가 참조를 통과한다 — 조건 필터의 대상이 아니다", () => {
        const e: SetExpr = { kind: "and", id: "root", of: [ref("fs1"), { kind: "cond", stage: stage("a") }] };
        expect(refsOf(removeNode(e, "a"))).toEqual(["fs1"]);   // 조건만 지워도 참조는 남는다
        expect(refsOf(removeNode(e, "n-fs1"))).toEqual([]);     // 참조도 제 id 로 지워진다
    });

    it("addLeafAt 이 참조 자리도 감싼다 — 잎과 같은 자격", () => {
        const e: SetExpr = { kind: "and", id: "root", of: [ref("fs1")] };
        const next = addLeafAt(e, "n-fs1", stage("b"), "or");
        expect(next.kind).toBe("and");
        expect(next.kind !== "cond" && next.kind !== "ref" && next.of[0]!.kind).toBe("or");
    });
});

describe("순환 참조 — 저장 시 거절의 자", () => {
    const sets = new Map<string, SetExpr>();
    const lookup = (id: string): SetExpr | undefined => sets.get(id);

    it("자기 자신을 가리키면 순환", () => {
        expect(hasCycle("A", { kind: "and", id: "r", of: [refNode("A")] }, lookup)).toBe(true);
    });

    it("건너서 닿아도 순환 — A → B → A", () => {
        sets.set("B", { kind: "and", id: "rb", of: [refNode("A")] });
        expect(hasCycle("A", { kind: "and", id: "ra", of: [refNode("B")] }, lookup)).toBe(true);
    });

    it("닿지 않으면 순환이 아니다 — 같은 집합을 둘이 가리켜도(다이아몬드)", () => {
        sets.clear();
        sets.set("B", { kind: "and", id: "rb", of: [refNode("C")] });
        sets.set("C", { kind: "and", id: "rc", of: [] });
        expect(hasCycle("A", { kind: "or", id: "ra", of: [refNode("B"), refNode("C")] }, lookup)).toBe(false);
    });
});

describe("addNodeAt — 빈 묶음은 감싸지 않는다", () => {
    // 실측이 본 자리: `비우기` 뒤에도 `OR 로 추가` 토글이 남아 있어 첫 조건이 OR 로 들어온다.
    // 감싸면 `OR(AND(), 새것)` — 평가는 activeExpr 이 구해 주지만 화면에 "모두 · 0" 유령이 선다.
    it("빈 루트에 OR 로 붙여도 묶음이 새로 안 생긴다", () => {
        const e = addLeafAt(emptyExpr(), null, newStage([{ kind: "date", ranges: [] }]), "or");
        expect(e.kind).toBe("and");
        expect(e.kind === "and" && e.of.map((c) => c.kind)).toEqual(["cond"]);
    });

    it("비지 않은 루트는 그대로 감싼다(기존 규칙)", () => {
        const one = exprOfStages([{ id: "a", enabled: true, predicates: [] }]);
        const e = addLeafAt(one, null, newStage([]), "or");
        expect(e.kind).toBe("or");
        expect(e.kind === "or" && e.of.map((c) => c.kind)).toEqual(["and", "cond"]);
    });
});
