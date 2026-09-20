// 한 줄 표기 — 식이 1층이라(2026-09-20) **괄호가 없다**. 옛 최소 괄호 규칙은 통째로 죽었고,
// 여기서 잠그는 건 "항을 순서대로 늘어놓고 사이에 연산자를 낱말로 끼운다" 하나다.
import { describe, it, expect } from "vitest";
import { exprToText, renderExpr } from "../exprRender.js";
import type { SetExpr, SetTerm } from "../expr.js";
import type { FilterStage } from "../stage.js";

const st = (id: string): FilterStage => ({ id, enabled: true, predicates: [] });
const leaf = (id: string, neg = false): SetTerm => ({ kind: "cond", stage: st(id), ...(neg ? { neg: true } : {}) });
const ref = (setId: string, neg = false): SetTerm => ({ kind: "ref", id: `n-${setId}`, setId, ...(neg ? { neg: true } : {}) });
const and = (of: SetTerm[]): SetExpr => ({ kind: "and", id: "root", of });
const or = (of: SetTerm[]): SetExpr => ({ kind: "or", id: "root", of });
const text = (e: SetExpr): string => exprToText(renderExpr(e, (id) => id));

describe("renderExpr — 괄호가 없다(한 묶음 = 한 연산자)", () => {
    it("항 사이에 연산자를 낱말로 끼운다", () => {
        expect(text(and([leaf("a"), leaf("b"), leaf("c")]))).toBe("a AND b AND c");
        expect(text(or([leaf("a"), leaf("b")]))).toBe("a OR b");
    });

    it("부정은 항 앞에 NOT — 괄호가 필요할 자리가 없다", () => {
        expect(text(and([leaf("a", true), leaf("b")]))).toBe("NOT a AND b");
    });

    it("참조는 ∈ 로 적는다 — 중첩이 사는 자리", () => {
        expect(text(and([leaf("a"), ref("fs1", true)]))).toBe("a AND NOT ∈fs1");
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
