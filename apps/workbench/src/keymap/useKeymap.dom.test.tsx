import { describe, it, expect } from "vitest";
import { isEditable } from "./useKeymap.js";

// isEditable — 입력 포커스 중 수식키 없는 단축키를 양보하는 판정. SELECT 누락으로
// 셀렉트 typeahead 가 단축키(w/s 등)에 죽던 회귀를 고정한다.
describe("isEditable", () => {
    const el = (tag: string): HTMLElement => document.createElement(tag);

    it("INPUT · TEXTAREA · SELECT 는 편집 취급", () => {
        expect(isEditable(el("input"))).toBe(true);
        expect(isEditable(el("textarea"))).toBe(true);
        expect(isEditable(el("select"))).toBe(true);
    });

    it("contentEditable 요소도 편집 취급", () => {
        const div = el("div");
        // jsdom 은 isContentEditable 을 구현하지 않아(항상 undefined) 브라우저 값을 직접 심는다.
        Object.defineProperty(div, "isContentEditable", { value: true });
        expect(isEditable(div)).toBe(true);
    });

    it("일반 요소·null 은 아님", () => {
        expect(isEditable(el("div"))).toBe(false);
        expect(isEditable(el("button"))).toBe(false);
        expect(isEditable(null)).toBe(false);
    });
});
