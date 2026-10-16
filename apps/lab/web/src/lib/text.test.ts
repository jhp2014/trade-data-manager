import { describe, expect, it } from "vitest";
import { highlightRe, splitHits } from "./text.js";

describe("검색어 강조", () => {
    it("낱말 아무거나, 대소문자 무시, 정규식 기호는 글자 그대로", () => {
        const re = highlightRe(" sk 하이닉스 (주) ".split(/\s+/));
        expect(splitHits("SK하이닉스(주) 급등", re)).toEqual([
            { text: "SK", hit: true },
            { text: "하이닉스", hit: true },
            { text: "(주)", hit: true },
            { text: " 급등", hit: false },
        ]);
    });
    it("빈 낱말·null 은 버리고, 하나도 없으면 강조 없음", () => {
        expect(highlightRe(["  ", null, undefined, ""])).toBeNull();
        expect(splitHits("그대로", null)).toEqual([{ text: "그대로", hit: false }]);
    });
    it("여러 번 맞으면 전부", () => {
        expect(splitHits("삼성 삼성전자", highlightRe(["삼성"])).filter((p) => p.hit)).toHaveLength(2);
    });
});
