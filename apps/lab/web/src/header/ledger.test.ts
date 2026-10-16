// 자리 장부의 판정 — 정보는 기본 줄, 컨트롤은 기본 판 안이고 **어떤 컨트롤이든** 장부가 줄로 꺼낼 수 있다.
import { afterEach, describe, expect, it } from "vitest";
import { controlPlaceOf, infoPlaceOf, linesOf, parseLayout, typeKeyOf, useHeaderLedger } from "./ledger.js";
import type { ControlSpec, HeaderDecl, InfoSpec } from "./spec.js";

const info = (over: Partial<InfoSpec> & { id: string }): InfoSpec => ({ name: over.id, text: () => "v", ...over });
const toggle = (over: Partial<ControlSpec> & { id: string }): ControlSpec => ({ kind: "toggle", name: over.id, on: false, set: () => {}, ...over }) as ControlSpec;

afterEach(() => {
    localStorage.clear();
    useHeaderLedger.setState({ layout: {} });
});

describe("typeKeyOf", () => {
    it("패널 id 는 종류(밑동), 슬롯 문법이 아니면 그대로", () => {
        expect(typeKeyOf("chart-2")).toBe("chart");
        expect(typeKeyOf("telegram-1")).toBe("telegram");
        expect(typeKeyOf("odd")).toBe("odd");
    });
});

describe("자리 판정", () => {
    it("정보: 장부 예외 > 선언 기본 > line. transient 는 배치 밖(hidden)", () => {
        expect(infoPlaceOf(info({ id: "a" }), undefined)).toBe("line");
        expect(infoPlaceOf(info({ id: "a", defaultPlace: "tab" }), undefined)).toBe("tab");
        expect(infoPlaceOf(info({ id: "a", defaultPlace: "tab" }), { info: { a: "bottom" } })).toBe("bottom");
        expect(infoPlaceOf(info({ id: "a", transient: true }), { info: { a: "line" } })).toBe("hidden");
    });

    it("컨트롤: 기본은 판 안(sheet) — 어떤 컨트롤이든 장부가 줄로 꺼낸다", () => {
        expect(controlPlaceOf(toggle({ id: "c" }), undefined)).toBe("sheet");
        expect(controlPlaceOf(toggle({ id: "c" }), { controls: { c: "line" } })).toBe("line");
        expect(controlPlaceOf(toggle({ id: "c", defaultPlace: "line" }), undefined)).toBe("line");
        expect(controlPlaceOf(toggle({ id: "c", defaultPlace: "line" }), { controls: { c: "sheet" } })).toBe("sheet");
    });
});

describe("linesOf", () => {
    const decl: HeaderDecl = {
        info: [info({ id: "date", defaultPlace: "tab" }), info({ id: "count" }), info({ id: "quiet", defaultPlace: "hidden" }), info({ id: "note", transient: true })],
        controls: [toggle({ id: "sort" }), toggle({ id: "search", defaultPlace: "line" })],
    };

    it("자리마다 조각을 나눈다 — transient·hidden 은 라인에 안 선다", () => {
        const l = linesOf(decl, undefined);
        expect(l.tab.map((i) => i.id)).toEqual(["date"]);
        expect(l.lineInfo.map((i) => i.id)).toEqual(["count"]);
        expect(l.lineControls.map((c) => c.id)).toEqual(["search"]);
        expect(l.bottom).toEqual([]);
    });

    it("장부 예외가 자리를 옮긴다", () => {
        const l = linesOf(decl, { info: { count: "bottom", date: "line" }, controls: { sort: "line", search: "sheet" } });
        expect(l.bottom.map((i) => i.id)).toEqual(["count"]);
        expect(l.lineInfo.map((i) => i.id)).toEqual(["date"]);
        expect(l.lineControls.map((c) => c.id)).toEqual(["sort"]);
    });
});

describe("장부 store — 예외만 저장한다", () => {
    it("기본 자리로 되돌리면 항목이 지워지고 빈 껍데기도 남지 않는다", () => {
        const sort = toggle({ id: "sort" });
        const { setControlPlace } = useHeaderLedger.getState();
        setControlPlace("chart", sort, "line");
        expect(useHeaderLedger.getState().layout).toEqual({ chart: { controls: { sort: "line" } } });
        setControlPlace("chart", sort, "sheet");
        expect(useHeaderLedger.getState().layout).toEqual({});
    });

    it("기본이 줄인 컨트롤을 판으로 넣는 것도 예외다", () => {
        const search = toggle({ id: "search", defaultPlace: "line" });
        useHeaderLedger.getState().setControlPlace("hts", search, "sheet");
        expect(useHeaderLedger.getState().layout).toEqual({ hts: { controls: { search: "sheet" } } });
    });

    it("localStorage(trade-lab.header)에 남는다", () => {
        useHeaderLedger.getState().setInfoPlace("chart", info({ id: "when" }), "tab");
        expect(JSON.parse(localStorage.getItem("trade-lab.header")!).state.layout).toEqual({ chart: { info: { when: "tab" } } });
    });
});

describe("장부 복원 — 저장본도 parseLayout 을 거친다", () => {
    it("새로 고침으로 다시 읽을 때 모르는 자리는 떨어지고 나머지는 산다", async () => {
        localStorage.setItem(
            "trade-lab.header",
            JSON.stringify({ state: { layout: { chart: { controls: { view: "line", mode: "floating" } }, theme: "깨짐" } }, version: 1 }),
        );
        await useHeaderLedger.persist.rehydrate();
        expect(useHeaderLedger.getState().layout).toEqual({ chart: { controls: { view: "line" } } });
    });
});

describe("parseLayout — 모르는 값은 항목 단위로 버린다", () => {
    it("자리 오타·이상한 모양만 떨어진다", () => {
        expect(
            parseLayout({
                chart: { info: { a: "tab", b: "middle" }, controls: { c: "line", d: 3 } },
                broken: "no",
                empty: {},
            }),
        ).toEqual({ chart: { info: { a: "tab" }, controls: { c: "line" } } });
        expect(parseLayout([])).toEqual({});
    });
});
