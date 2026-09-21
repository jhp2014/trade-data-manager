// 한 줄 표기 — 항을 순서대로 늘어놓고 사이에 연산자를 낱말로 끼우며, **손으로 친 괄호를 그대로**
// 그린다(2026-09-21). 옛 「최소 괄호」(우선순위로 복원되는 괄호는 안 그린다)는 부활하지 않는다 —
// 숨은 우선순위가 없으므로 "지워도 되는 괄호"라는 개념 자체가 없다.
import { describe, it, expect } from "vitest";
import { exprToText, renderExpr } from "../exprRender.js";
import { promoteBoundary, setOpAt, type SetExpr, type SetTerm } from "../expr.js";
import type { FilterStage } from "../stage.js";

const st = (id: string): FilterStage => ({ id, enabled: true, predicates: [] });
const leaf = (id: string, neg = false): SetTerm => ({ kind: "cond", stage: st(id), ...(neg ? { neg: true } : {}) });
const ref = (setId: string, neg = false): SetTerm => ({ kind: "ref", id: `n-${setId}`, setId, ...(neg ? { neg: true } : {}) });
const mk = (op: "and" | "or", of: SetTerm[]): SetExpr => ({ id: "root", of, ops: of.slice(1).map(() => op), groups: [] });
const and = (of: SetTerm[]): SetExpr => mk("and", of);
const or = (of: SetTerm[]): SetExpr => mk("or", of);
const text = (e: SetExpr): string => exprToText(renderExpr(e, (id) => id));

describe("renderExpr — 항·연산자·괄호", () => {
    it("항 사이에 연산자를 낱말로 끼운다", () => {
        expect(text(and([leaf("a"), leaf("b"), leaf("c")]))).toBe("a AND b AND c");
        expect(text(or([leaf("a"), leaf("b")]))).toBe("a OR b");
    });

    it("부정은 항 앞에 NOT — 괄호가 필요할 자리가 없다", () => {
        expect(text(and([leaf("a", true), leaf("b")]))).toBe("NOT a AND b");
    });

    it("참조 칩도 이름만 적는다 — `∈` 표기는 폐기됐다(묶음·집합·조건 모음이 한 물건이라)", () => {
        expect(text(and([leaf("a"), ref("fs1", true)]))).toBe("a AND NOT fs1");
    });

    it("손으로 친 괄호를 그대로 그린다 — 연산자는 괄호 **안쪽**에 선다", () => {
        const e = setOpAt(and([leaf("a"), leaf("b"), leaf("c")]), 1, "or");
        expect(text(e)).toBe("(a AND b) OR c");
        expect(text(promoteBoundary(e, 0))).toBe("a AND (b OR c)");
    });

    it("항이 하나면 연산자가 안 나오고, 비면 아무것도 안 낸다", () => {
        expect(text(and([leaf("a")]))).toBe("a");
        expect(text(and([]))).toBe("");
    });
});

describe("renderExpr — 조각의 정체", () => {
    it("조건 조각은 id·부정·꺼짐을 들고 나간다 — 화면이 칠할 재료", () => {
        const off: SetTerm = { kind: "cond", stage: { id: "x", enabled: false, predicates: [] }, neg: true };
        expect(renderExpr(and([off]), (id) => `이름:${id}`)).toEqual([
            { kind: "leaf", id: "x", label: "이름:x", neg: true, enabled: false },
        ]);
    });

    it("참조 조각은 setId 와 이름을 갈라 들고 나간다 — 이름은 파생이라 화면이 준다", () => {
        expect(renderExpr(and([ref("fs1")]), (id) => id, (id) => (id === "fs1" ? "아침 돌파" : "?"))).toEqual([
            { kind: "ref", id: "n-fs1", setId: "fs1", label: "아침 돌파", neg: false },
        ]);
    });
});
