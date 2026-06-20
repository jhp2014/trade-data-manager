import { describe, expect, it } from "vitest";
import {
    collectRefs,
    evalHypExpr,
    parseHypExpr,
    searchCasesByExpr,
    unknownRefs,
    type HypExpr,
} from "@/services/hypExpr";
import type { Case, Hypothesis, HypothesisCase } from "@/domain/types";

function parse(s: string): HypExpr {
    const r = parseHypExpr(s);
    if (!r.ok) throw new Error(`parse 실패: ${r.error}`);
    return r.expr;
}

describe("parseHypExpr — 구조/우선순위", () => {
    it("OR 보다 AND 가 먼저 묶인다: A | B & C → or(A, and(B,C))", () => {
        const e = parse("A | B & C");
        expect(e.kind).toBe("or");
        if (e.kind !== "or") return;
        expect(e.items[0]).toEqual({ kind: "ref", code: "A" });
        expect(e.items[1].kind).toBe("and");
    });

    it("NOT 이 최우선: !A & B → and(not(A), B)", () => {
        const e = parse("!A & B");
        expect(e).toEqual({
            kind: "and",
            items: [{ kind: "not", expr: { kind: "ref", code: "A" } }, { kind: "ref", code: "B" }],
        });
    });

    it("같은 연산자 연속은 n-항으로 평탄화: A & B & C", () => {
        const e = parse("A & B & C");
        expect(e.kind).toBe("and");
        if (e.kind === "and") expect(e.items).toHaveLength(3);
    });

    it("괄호로 우선순위를 뒤집는다: (A | B) & C", () => {
        const e = parse("(A | B) & C");
        expect(e.kind).toBe("and");
        if (e.kind !== "and") return;
        expect(e.items[0].kind).toBe("or");
        expect(e.items[1]).toEqual({ kind: "ref", code: "C" });
    });

    it("기호와 영단어 연산자를 함께 쓸 수 있다", () => {
        const sym = parse("(H0001 & H0002) | !H0003");
        const word = parse("(H0001 and H0002) or not H0003");
        expect(word).toEqual(sym);
    });

    it("코드는 대문자로 정규화된다", () => {
        expect(parse("h0001")).toEqual({ kind: "ref", code: "H0001" });
    });

    it("중첩 구조를 보존한다: ((A & B) | C) & !D", () => {
        const e = parse("((H0001 & H0002) or H0003) and !H0004");
        expect(e.kind).toBe("and");
        if (e.kind !== "and") return;
        expect(e.items[0].kind).toBe("or"); // (A&B) | C
        expect(e.items[1]).toEqual({ kind: "not", expr: { kind: "ref", code: "H0004" } });
    });
});

describe("parseHypExpr — 오류", () => {
    it.each([
        ["", "식이 비어 있습니다"],
        ["A &", "가설 코드가 필요한 자리입니다"],
        ["(A | B", "괄호가 맞지 않습니다"],
        ["A B", "예기치 않은 토큰"],
        ["A @ B", "알 수 없는 문자: '@'"],
    ])("%s → 오류", (input, msg) => {
        const r = parseHypExpr(input);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe(msg);
    });
});

describe("collectRefs / unknownRefs", () => {
    it("등장 순서로 중복 제거", () => {
        expect(collectRefs(parse("A & B | A & C"))).toEqual(["A", "B", "C"]);
    });
    it("알 수 없는 코드만 골라낸다", () => {
        expect(unknownRefs(parse("A & X"), ["A", "B"])).toEqual(["X"]);
    });
});

describe("evalHypExpr", () => {
    const has = (set: string[]) => (c: string) => set.includes(c);
    it("AND/OR/NOT 조합", () => {
        const e = parse("(A & B) | !C");
        expect(evalHypExpr(e, has(["A", "B"]))).toBe(true); // 좌항 참
        expect(evalHypExpr(e, has(["A"]))).toBe(true); // !C 참
        expect(evalHypExpr(e, has(["A", "C"]))).toBe(false); // 둘 다 거짓
    });
});

// --- searchCasesByExpr ---
const mkCase = (caseId: string): Case => ({
    caseId,
    stockCode: caseId,
    stockName: null,
    tradeDate: "2026-06-05",
    tradeTime: null,
    outcome: null,
    extra: {},
});
const hyp = (id: string, code: string): Hypothesis => ({ id, code, text: code, status: "", extra: {} });
const link = (hypothesisId: string, caseId: string): HypothesisCase => ({
    id: `${hypothesisId}-${caseId}`,
    hypothesisId,
    caseId,
    note: null,
    extra: {},
});

// A: H0001,H0002 / B: H0002 / C: H0003 / D: (링크 없음)
const SNAP = {
    cases: ["A", "B", "C", "D"].map(mkCase),
    hypotheses: [hyp("1", "H0001"), hyp("2", "H0002"), hyp("3", "H0003")],
    hypothesisCases: [link("1", "A"), link("2", "A"), link("2", "B"), link("3", "C")],
};

function ids(s: string) {
    return searchCasesByExpr(SNAP, parse(s)).map((r) => r.caseId).sort();
}

describe("searchCasesByExpr", () => {
    it("AND: H0001 & H0002 → A 만", () => {
        expect(ids("H0001 & H0002")).toEqual(["A"]);
    });
    it("OR: H0001 | H0003 → A, C", () => {
        expect(ids("H0001 | H0003")).toEqual(["A", "C"]);
    });
    it("NOT 모집단은 전체 case — 링크 없는 D 도 !H0002 에 걸린다", () => {
        expect(ids("!H0002")).toEqual(["C", "D"]);
    });
    it("복합식: (H0001 | H0003) & !H0002 → C", () => {
        expect(ids("(H0001 | H0003) & !H0002")).toEqual(["C"]);
    });
    it("알 수 없는 코드는 false 로 평가(양수 리프)", () => {
        expect(ids("H9999")).toEqual([]);
    });
});
