// 한 줄 표기의 **괄호 규칙** — 이 표를 깨면 같은 식이 두 화면에서 다르게 읽힌다.
import { describe, it, expect } from "vitest";
import { exprToText, renderExpr } from "../exprRender.js";
import type { SetExpr } from "../expr.js";
import type { FilterStage } from "../stage.js";

const st = (id: string): FilterStage => ({ id, enabled: true, predicates: [] });
const leaf = (id: string, neg = false): SetExpr => ({ kind: "cond", stage: st(id), ...(neg ? { neg: true } : {}) });
const and = (id: string, of: SetExpr[], neg = false): SetExpr => ({ kind: "and", id, of, ...(neg ? { neg: true } : {}) });
const or = (id: string, of: SetExpr[], neg = false): SetExpr => ({ kind: "or", id, of, ...(neg ? { neg: true } : {}) });
const text = (e: SetExpr): string => exprToText(renderExpr(e, (id) => id));

describe("renderExpr — 괄호는 필요할 때만", () => {
    it("우선순위로 복원되는 구조엔 안 친다 — ¬ > ∧ > ∨", () => {
        // a ∧ b ∨ c ∧ d 는 (a∧b) ∨ (c∧d) 로 읽히므로 괄호가 군더더기다.
        expect(text(or("r", [and("n1", [leaf("a"), leaf("b")]), and("n2", [leaf("c"), leaf("d")])])))
            .toBe("a ∧ b ∨ c ∧ d");
    });

    it("OR 이 AND 안에 들어가면 친다 — 복원이 안 된다", () => {
        expect(text(and("r", [or("n1", [leaf("a"), leaf("b")]), leaf("c")])))
            .toBe("(a ∨ b) ∧ c");
    });

    it("부정된 묶음은 친다 — 안 치면 ¬ 가 첫 항만 먹는다", () => {
        expect(text(and("r", [or("n1", [leaf("a"), leaf("b")], true)]))).toBe("¬(a ∨ b)");
        // AND 묶음의 부정도 마찬가지 — ¬ 가 가장 강해서 괄호가 없으면 뜻이 갈린다.
        expect(text(or("r", [and("n1", [leaf("a"), leaf("b")], true), leaf("c")]))).toBe("¬(a ∧ b) ∨ c");
    });

    it("잎의 부정은 괄호가 없다 — ¬ 가 원자에 붙는다", () => {
        expect(text(and("r", [leaf("a", true), leaf("b")]))).toBe("¬a ∧ b");
    });

    it("루트에는 바깥 괄호가 안 생긴다", () => {
        expect(text(or("r", [leaf("a"), leaf("b")]))).toBe("a ∨ b");
        expect(text(and("r", [leaf("a")]))).toBe("a");
    });

    it("AND 안의 AND 는 안 친다(결합법칙) · OR 안의 OR 도 마찬가지", () => {
        expect(text(and("r", [and("n1", [leaf("a"), leaf("b")]), leaf("c")]))).toBe("a ∧ b ∧ c");
        expect(text(or("r", [or("n1", [leaf("a"), leaf("b")]), leaf("c")]))).toBe("a ∨ b ∨ c");
    });

    it("빈 묶음은 아무것도 안 낸다(루트가 비었을 때)", () => {
        expect(text(and("root", []))).toBe("");
    });
});

describe("renderExpr — 조각의 정체", () => {
    it("잎 조각은 id·부정·꺼짐을 들고 나간다 — 화면이 칠할 재료", () => {
        const off: SetExpr = { kind: "cond", stage: { id: "x", enabled: false, predicates: [] }, neg: true };
        expect(renderExpr(and("r", [off]), (id) => `이름:${id}`)).toEqual([
            { kind: "leaf", id: "x", label: "이름:x", neg: true, enabled: false },
        ]);
    });
});
