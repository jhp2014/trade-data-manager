import { describe, it, expect } from "vitest";
import { hasBodyText, linksFromEntities, presentNewsText, previewOf } from "../newsSearch.js";

describe("presentNewsText — 본문 vs 미리보기 제목 규칙(라이브·아카이브 공용)", () => {
    it("사람이 쓴 본문이 있으면 본문 그대로, url 은 미리보기 → 본문 첫 링크 순", () => {
        const r = presentNewsText("삼성전자 신고가\nhttps://a.b/c", { title: "기사", url: "https://x.y/z" });
        expect(r).toEqual({ text: "삼성전자 신고가\nhttps://a.b/c", url: "https://x.y/z", fromBody: true });
        expect(presentNewsText("본문만 https://q.w/e")?.url).toBe("https://q.w/e");
    });

    it("URL-only 메시지는 미리보기 제목(→설명→원문)으로 바꾸고 fromBody=false", () => {
        expect(presentNewsText("https://a.b/c", { title: "제목", description: "설명" })).toEqual({
            text: "제목",
            url: "https://a.b/c",
            fromBody: false,
        });
        expect(presentNewsText("https://a.b/c", { title: "", description: "설명" })?.text).toBe("설명");
    });

    it("본문도 미리보기 제목도 없으면 null(미디어-only)", () => {
        expect(presentNewsText("", undefined)).toBeNull();
        expect(presentNewsText("  ", { description: "d" })).toBeNull();
    });

    it("hasBodyText 는 URL-only 줄만으로 된 본문을 거짓으로", () => {
        expect(hasBodyText("https://a.b\n\nhttps://c.d")).toBe(false);
        expect(hasBodyText("글 https://a.b")).toBe(true);
    });
});

describe("previewOf", () => {
    it("제목·설명 중 있는 것만, 둘 다 없거나 빈 문자열이면 undefined", () => {
        expect(previewOf({ title: "제목", description: "설명", url: "u" })).toEqual({ title: "제목", description: "설명" });
        expect(previewOf({ title: "", description: "설명" })).toEqual({ description: "설명" });
        expect(previewOf({ url: "u" })).toBeUndefined();
        expect(previewOf(undefined)).toBeUndefined();
    });
});

describe("linksFromEntities", () => {
    it("TextUrl 만 뽑고, 없으면 undefined", () => {
        expect(
            linksFromEntities([
                { type: "Url", offset: 0, length: 5 },
                { type: "TextUrl", offset: 6, length: 3, url: "https://n.com/1" },
                { type: "Bold", offset: 0, length: 2 },
            ]),
        ).toEqual([{ offset: 6, length: 3, url: "https://n.com/1" }]);
        expect(linksFromEntities([{ type: "Url", offset: 0, length: 5 }])).toBeUndefined();
        expect(linksFromEntities(undefined)).toBeUndefined();
    });
});
