import { describe, expect, it } from "vitest";
import {
    assignDigit,
    controlPlaceOf,
    digitOf,
    infoPlaceOf,
    linesOf,
    parseKeys,
    parseLayout,
    typeKeyOf,
} from "../ledger.js";
import type { ControlSpec, HeaderDecl, InfoSpec } from "../spec.js";

const info = (over: Partial<InfoSpec> & { id: string }): InfoSpec => ({ name: over.id, text: () => "v", ...over });
const toggle = (over: Partial<ControlSpec> & { id: string }): ControlSpec =>
    ({ kind: "toggle", name: over.id, on: false, set: () => {}, ...over }) as ControlSpec;

describe("typeKeyOf", () => {
    it("슬롯 id 는 밑동, 슬롯 문법이 아니면 그대로", () => {
        expect(typeKeyOf("chart-2")).toBe("chart");
        expect(typeKeyOf("daily-explore-1")).toBe("daily-explore");
        expect(typeKeyOf("news")).toBe("news");
    });
});

describe("자리 판정", () => {
    it("정보: 장부 예외 > 선언 기본 > line. transient 는 배치 밖(hidden)", () => {
        expect(infoPlaceOf(info({ id: "a" }), undefined)).toBe("line");
        expect(infoPlaceOf(info({ id: "a", defaultPlace: "tab" }), undefined)).toBe("tab");
        expect(infoPlaceOf(info({ id: "a", defaultPlace: "tab" }), { info: { a: "bottom" } })).toBe("bottom");
        expect(infoPlaceOf(info({ id: "a", transient: true, defaultPlace: "tab" }), { info: { a: "line" } })).toBe("hidden");
    });

    it("컨트롤: nav 가 아니면 장부가 뭐라 해도 sheet — 첫 줄 자격은 항해형뿐", () => {
        expect(controlPlaceOf(toggle({ id: "c" }), { controls: { c: "line" } })).toBe("sheet");
        expect(controlPlaceOf(toggle({ id: "c", nav: true }), undefined)).toBe("line");
        expect(controlPlaceOf(toggle({ id: "c", nav: true }), { controls: { c: "sheet" } })).toBe("sheet");
    });
});

describe("linesOf", () => {
    const decl: HeaderDecl = {
        info: [
            info({ id: "date", defaultPlace: "tab" }),
            info({ id: "count" }),
            info({ id: "hiddenOne", defaultPlace: "hidden" }),
            info({ id: "note", transient: true }),
            info({ id: "gone", available: false }),
        ],
        controls: [
            toggle({ id: "sort" }),
            toggle({ id: "cross", nav: true }),
            toggle({ id: "off", nav: true, available: false }),
        ],
    };

    it("자리마다 조각을 배분한다 — transient·available:false·hidden 은 라인에 안 선다", () => {
        const l = linesOf(decl, undefined);
        expect(l.tab.map((i) => i.id)).toEqual(["date"]);
        expect(l.lineInfo.map((i) => i.id)).toEqual(["count"]);
        expect(l.lineControls.map((c) => c.id)).toEqual(["cross"]);
        expect(l.bottom).toEqual([]);
    });

    it("장부 예외가 자리를 옮긴다 — 값이 비어도 배치는 그대로다(라인 존재 = 설정)", () => {
        const l = linesOf(decl, { info: { count: "bottom", date: "line" }, controls: { cross: "sheet" } });
        expect(l.bottom.map((i) => i.id)).toEqual(["count"]);
        expect(l.lineInfo.map((i) => i.id)).toEqual(["date"]);
        expect(l.lineControls).toEqual([]);
    });
});

describe("숫자 배정", () => {
    it("한 컨트롤은 숫자 하나 — 다른 숫자에 있었다면 옮긴다", () => {
        const e = assignDigit({ "1": "sort" }, 2, "sort");
        expect(e).toEqual({ "2": "sort" });
    });

    it("그 숫자의 기존 주인은 자리를 잃는다(교체)", () => {
        expect(assignDigit({ "1": "sort" }, 1, "cross")).toEqual({ "1": "cross" });
    });

    it("같은 컨트롤·같은 숫자 재배정 = 해제", () => {
        expect(assignDigit({ "1": "sort", "2": "cross" }, 1, "sort")).toEqual({ "2": "cross" });
    });

    it("digitOf — 배정된 숫자를 되찾는다", () => {
        expect(digitOf({ "3": "sort" }, "sort")).toBe(3);
        expect(digitOf({ "3": "sort" }, "cross")).toBeNull();
        expect(digitOf(undefined, "sort")).toBeNull();
    });
});

describe("파서 — 모르는 값은 항목 단위로 버린다(장부 전체를 버리지 않는다)", () => {
    it("layout: 자리 오타·이상한 모양만 떨어진다", () => {
        expect(
            parseLayout({
                chart: { info: { a: "tab", b: "middle" }, controls: { c: "line", d: 3 } },
                broken: "no",
                empty: {},
            }),
        ).toEqual({ chart: { info: { a: "tab" }, controls: { c: "line" } } });
    });

    it("keys: 숫자 1~5 밖·문자열 아닌 id 는 떨어진다", () => {
        expect(parseKeys({ chart: { "1": "sort", "9": "x", "2": 5 }, junk: null })).toEqual({ chart: { "1": "sort" } });
        expect(parseKeys([])).toBeNull();
    });
});
