import { describe, expect, it } from "vitest";
import {
    matchHypSearch,
    parseHypSearchExpr,
    type HypMatchTarget,
} from "@/services/hypSearchExpr";

function parse(input: string) {
    const r = parseHypSearchExpr(input);
    if (!r.ok) throw new Error(`parse failed: ${r.error}`);
    return r.expr;
}

function match(input: string, target: HypMatchTarget) {
    return matchHypSearch(parse(input), target);
}

describe("parseHypSearchExpr", () => {
    it("빈 식은 오류", () => {
        expect(parseHypSearchExpr("   ")).toEqual({ ok: false, error: "검색어가 비어 있습니다" });
    });

    it("일반 단어는 text 리프", () => {
        expect(parse("삼성")).toEqual({ kind: "term", field: "text", value: "삼성" });
    });

    it("# 접두는 tag 리프", () => {
        expect(parse("#급등")).toEqual({ kind: "term", field: "tag", value: "급등" });
    });

    it("공백은 암묵적 AND 로 평탄화", () => {
        expect(parse("삼성 반도체")).toEqual({
            kind: "and",
            items: [
                { kind: "term", field: "text", value: "삼성" },
                { kind: "term", field: "text", value: "반도체" },
            ],
        });
    });

    it("괄호·연산자 우선순위(NOT > AND > OR)", () => {
        expect(parse("a | b & !c")).toEqual({
            kind: "or",
            items: [
                { kind: "term", field: "text", value: "a" },
                {
                    kind: "and",
                    items: [
                        { kind: "term", field: "text", value: "b" },
                        { kind: "not", expr: { kind: "term", field: "text", value: "c" } },
                    ],
                },
            ],
        });
    });

    it("괄호 불일치는 오류", () => {
        expect(parseHypSearchExpr("(a & b").ok).toBe(false);
    });
});

describe("matchHypSearch", () => {
    const target: HypMatchTarget = { text: "삼성전자 급등 가설", tags: ["반도체", "단타"] };

    it("text 부분일치(대소문자 무시)", () => {
        expect(match("삼성", target)).toBe(true);
        expect(match("LG", target)).toBe(false);
    });

    it("tag 부분일치", () => {
        expect(match("#반도체", target)).toBe(true);
        expect(match("#반도", target)).toBe(true); // 부분일치 허용
        expect(match("#장기", target)).toBe(false);
    });

    it("암묵적 AND 는 모든 단어 포함", () => {
        expect(match("삼성 급등", target)).toBe(true);
        expect(match("삼성 하락", target)).toBe(false);
    });

    it("OR / NOT", () => {
        expect(match("LG | 급등", target)).toBe(true);
        expect(match("!장기", target)).toBe(true);
        expect(match("삼성 & !단타", { ...target, tags: [] })).toBe(true);
    });

    it("태그·텍스트 혼합", () => {
        expect(match("#단타 급등", target)).toBe(true);
        expect(match("#단타 & !#반도체", target)).toBe(false);
    });
});
