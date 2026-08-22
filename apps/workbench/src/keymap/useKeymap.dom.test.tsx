import { describe, it, expect } from "vitest";
import { claimsActivation, isEditable } from "./useKeymap.js";

// claimsActivation — 버튼은 클릭 뒤에도 포커스가 남아, 헤더 버튼을 누른 다음 Space 가 전역
// 커맨드(타점 저장/삭제 = 쓰기)로 새어 나가던 사고. 활성화 키 둘만 컨트롤에 양보한다.
describe("claimsActivation", () => {
    const el = (tag: string, role?: string): HTMLElement => {
        const e = document.createElement(tag);
        if (role) e.setAttribute("role", role);
        return e;
    };

    it("버튼·링크·role=button 에 Space/Enter 는 컨트롤의 것", () => {
        expect(claimsActivation(el("button"), "space")).toBe(true);
        expect(claimsActivation(el("button"), "enter")).toBe(true);
        expect(claimsActivation(el("a"), "enter")).toBe(true);
        expect(claimsActivation(el("div", "button"), "space")).toBe(true);
        expect(claimsActivation(el("div", "tab"), "space")).toBe(true);
    });

    it("활성화 키가 아니면 버튼 포커스 중에도 단축키가 산다(a/d/w/s)", () => {
        expect(claimsActivation(el("button"), "a")).toBe(false);
        expect(claimsActivation(el("button"), "ctrl+1")).toBe(false);
    });

    it("일반 요소·null 은 양보 안 함", () => {
        expect(claimsActivation(el("div"), "space")).toBe(false);
        expect(claimsActivation(document.body, "space")).toBe(false);
        expect(claimsActivation(null, "space")).toBe(false);
    });
});

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
