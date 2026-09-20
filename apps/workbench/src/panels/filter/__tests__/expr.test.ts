// 식(`SetExpr`)의 순수부 — **한 층**이다(2026-09-20). 중첩은 식 안이 아니라 집합 사이(참조)에 있다.
//
// 여기서 잠그는 것 넷:
//  ① `leavesOf` 의 **참조 동일성** — 셀렉터 얕은 비교가 이것 하나에 걸려 있다.
//  ② 편집 함수가 안 바뀐 항의 **객체를 유지**한다(React memo 가 헛돌지 않게).
//  ③ 파싱은 **항 단위로 관대**하다 — 항 하나가 깨져도 집합 전체가 증발하지 않는다.
//  ④ 참조는 **조건이 아니다** — 조건 목록·조건 수에 안 든다(내용이 남의 것이라).
import { describe, it, expect } from "vitest";
import {
    activeExpr, appendLeaf, appendTerm, emptyExpr, exprOfStages, filterLeaves, findTerm, hasCycle,
    leafCount, leavesOf, mapLeaves, negOf, negateTerm, parseExpr, refNode, refsOf, removeTerm,
    replaceTerm, toggleOperator, type SetExpr, type SetTerm,
} from "../expr.js";
import { parseStages, type FilterStage } from "../stage.js";

const st = (id: string, name?: string): FilterStage =>
    ({ id, enabled: true, predicates: [{ kind: "date", ranges: [{ from: "2026-01-01", to: "2026-01-31" }] }], ...(name ? { name } : {}) });
const cond = (id: string, neg = false): SetTerm => ({ kind: "cond", stage: st(id), ...(neg ? { neg: true as const } : {}) });
const expr = (kind: "and" | "or", of: SetTerm[]): SetExpr => ({ kind, id: "root", of });

describe("leavesOf — 평평한 목록을 읽는 소비자의 투영", () => {
    it("표시 순서 그대로", () => {
        expect(leavesOf(expr("and", [cond("a"), cond("b")])).map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("같은 식이면 **같은 배열**을 돌려준다 — 셀렉터 얕은 비교가 성립해야 한다", () => {
        const e = expr("and", [cond("a")]);
        expect(leavesOf(e)).toBe(leavesOf(e));
    });

    it("식이 바뀌면 새 배열 — 캐시가 낡지 않는다", () => {
        const e = expr("and", [cond("a")]);
        expect(leavesOf(appendLeaf(e, st("b")))).not.toBe(leavesOf(e));
    });

    it("leafCount 는 leavesOf().length 와 같다(배열을 안 만드는 판)", () => {
        const e = expr("or", [cond("a"), refNode("fs1"), cond("b")]);
        expect(leafCount(e)).toBe(leavesOf(e).length);
        expect(leafCount(e), "참조는 조건 수에 안 든다").toBe(2);
    });
});

describe("편집 — 안 바뀐 항은 객체가 유지된다", () => {
    it("mapLeaves: 아무것도 안 바뀌면 식 자체가 같은 객체", () => {
        const e = expr("and", [cond("a"), cond("b")]);
        expect(mapLeaves(e, (s) => s)).toBe(e);
    });

    it("mapLeaves: 바뀐 조건만 새 객체 — 형제는 그대로", () => {
        const e = expr("and", [cond("a"), cond("b")]);
        const next = mapLeaves(e, (s) => (s.id === "a" ? { ...s, enabled: false } : s));
        expect(next).not.toBe(e);
        expect(next.of[1]).toBe(e.of[1]);
    });

    it("filterLeaves: 참조는 조건 필터의 대상이 아니다 — 통과한다", () => {
        const e = expr("and", [cond("a"), refNode("fs1")]);
        const next = filterLeaves(e, () => false);
        expect(next.of.map((t) => t.kind)).toEqual(["ref"]);
    });

    it("filterLeaves: 전부 걸러내도 빈 루트가 남는다 — 붙이기·비우기가 늘 성립하게", () => {
        expect(filterLeaves(expr("and", [cond("a")]), () => false).of).toEqual([]);
    });

    it("replaceTerm/removeTerm/negateTerm — 주소는 항 id(조건은 stage.id)", () => {
        const e = expr("and", [cond("a"), refNode("fs1")]);
        const refId = e.of[1]!.kind === "ref" ? e.of[1]!.id : "";
        expect(negOf(negateTerm(e, "a"), "a")).toBe(true);
        expect(negOf(negateTerm(negateTerm(e, "a"), "a"), "a"), "두 번 누르면 꺼진다").toBe(false);
        expect(removeTerm(e, refId).of).toHaveLength(1);
        expect(removeTerm(e, "없는것"), "없는 주소는 식을 안 바꾼다").toBe(e);
        expect(findTerm(e, "a")?.kind).toBe("cond");
        expect(replaceTerm(e, "a", (t) => t)).toBe(e);
    });

    it("toggleOperator 는 **식 전체**의 것이다 — 한 묶음 = 한 연산자", () => {
        expect(toggleOperator(expr("and", [cond("a")])).kind).toBe("or");
        expect(toggleOperator(expr("or", [cond("a")])).kind).toBe("and");
    });
});

describe("activeExpr — 끄기는 결손이 아니라 **부재**다", () => {
    it("꺼진 조건·빈 술어 조건은 평가에서 빠진다", () => {
        const off: SetTerm = { kind: "cond", stage: { ...st("off"), enabled: false } };
        const empty: SetTerm = { kind: "cond", stage: { id: "e", enabled: true, predicates: [{ kind: "date", ranges: [] }] } };
        expect(leavesOf(activeExpr(expr("and", [cond("a"), off, empty]))).map((s) => s.id)).toEqual(["a"]);
    });

    it("OR 에서 조건을 끄면 나머지 항이 남는다", () => {
        const off: SetTerm = { kind: "cond", stage: { ...st("off"), enabled: false } };
        const next = activeExpr(expr("or", [off, cond("live")]));
        expect(next.kind, "연산자는 안 바뀐다").toBe("or");
        expect(leavesOf(next).map((s) => s.id)).toEqual(["live"]);
    });

    it("참조는 안 걷힌다 — 꺼짐이라는 개념이 없다(남의 것이다)", () => {
        expect(activeExpr(expr("and", [refNode("fs1")])).of).toHaveLength(1);
    });
});

describe("파싱 — 항 단위로 관대하다", () => {
    const round = (e: SetExpr): SetExpr | null => parseExpr(JSON.parse(JSON.stringify(e)), parseStages);

    it("왕복 항등 — 부정 수식어까지", () => {
        const e = expr("or", [cond("a", true), { ...refNode("fs1"), neg: true }]);
        expect(round(e)).toEqual(e);
    });

    it("부정 부재는 필드 없이 읽힌다 — 저장물이 필드 추가 없이 승계된다", () => {
        const e = expr("and", [cond("a")]);
        expect(round(e)!.of[0]).not.toHaveProperty("neg");
    });

    it("못 읽는 항만 떨어지고 나머지는 산다", () => {
        const raw = { kind: "and", id: "root", of: [{ kind: "cond", stage: { id: "a", enabled: true, predicates: [{ kind: "date", ranges: [] }] } }, { kind: "cond", stage: "쓰레기" }, { kind: "ref" }] };
        const e = parseExpr(raw, parseStages);
        expect(e!.of).toHaveLength(1);
    });

    it("항 id 가 없으면 발급한다(손으로 쓴 저장물)", () => {
        const e = parseExpr({ kind: "or", of: [{ kind: "ref", setId: "fs1" }] }, parseStages);
        expect(e!.kind).toBe("or");
        expect(e!.of[0]!.kind === "ref" && e!.of[0]!.id.length > 0).toBe(true);
    });

    it("모양이 아예 아니면 null — 호출부가 빈 식으로 떨어질 수 있게", () => {
        expect(parseExpr(null, parseStages)).toBeNull();
        expect(parseExpr({ kind: "cond" }, parseStages), "루트는 묶음이어야 한다").toBeNull();
    });
});

describe("참조 항 — 중첩이 사는 자리", () => {
    it("참조는 조건 목록에 안 든다 — 내용이 남의 것이다", () => {
        expect(leavesOf(expr("and", [cond("a"), refNode("fs1")])).map((s) => s.id)).toEqual(["a"]);
    });

    it("refsOf — 쓰는 집합 id 를 중복 없이 모은다", () => {
        expect(refsOf(expr("and", [refNode("fs1"), refNode("fs2"), refNode("fs1")])).sort()).toEqual(["fs1", "fs2"]);
    });

    it("appendTerm 으로 참조를 붙인다 — 조건과 같은 자격", () => {
        const e = appendTerm(expr("and", [cond("a")]), refNode("fs1"));
        expect(e.of.map((t) => t.kind)).toEqual(["cond", "ref"]);
    });
});

describe("순환 참조 — 저장 시 거절의 자", () => {
    const exprOfSet = (map: Record<string, SetExpr>) => (id: string): SetExpr | undefined => map[id];

    it("자기 자신을 가리키면 순환", () => {
        expect(hasCycle("A", expr("and", [refNode("A")]), exprOfSet({}))).toBe(true);
    });

    it("건너서 닿아도 순환 — A → B → A", () => {
        const map = { B: expr("and", [refNode("A")]) };
        expect(hasCycle("A", expr("and", [refNode("B")]), exprOfSet(map))).toBe(true);
    });

    it("닿지 않으면 순환이 아니다 — 같은 집합을 둘이 가리켜도(다이아몬드)", () => {
        const map = { B: expr("and", [refNode("C")]), C: expr("and", []), D: expr("and", [refNode("C")]) };
        expect(hasCycle("A", expr("and", [refNode("B"), refNode("D")]), exprOfSet(map))).toBe(false);
    });
});

describe("빈 식 · 승계 지름길", () => {
    it("exprOfStages — 조건 id 는 그대로, 루트는 AND", () => {
        const e = exprOfStages([st("a"), st("b")]);
        expect(e.kind).toBe("and");
        expect(leavesOf(e).map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("빈 식 = 조건 0개('제한 없음'이지 '전부 탈락'이 아니다)", () => {
        expect(emptyExpr().of).toEqual([]);
        expect(exprOfStages([]).of).toEqual([]);
    });
});
