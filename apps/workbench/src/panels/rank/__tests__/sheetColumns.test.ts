import { describe, it, expect } from "vitest";
import { COL_META, colKey, layoutColumns, pruneAxisKeys, reorderFrozenCols, type Col } from "../sheetColumns.js";

const ax = (id: string): Col => ({ key: "axis", axisId: id, name: `축${id}`, computed: false });
/** 계산 축 — 값이 들어가야 해서 고정폭(분배에서 빠진다). */
const cax = (id: string): Col => ({ key: "axis", axisId: id, name: `계산${id}`, computed: true });
const BASE: Col[] = [{ key: "name" }, { key: "date" }, { key: "time" }, ax("1"), ax("2")];
const AXIS_MIN = 56;

const layout = (over: Partial<Parameters<typeof layoutColumns>[0]> = {}) =>
    layoutColumns({ baseCols: BASE, frozenCols: [], hiddenCols: [], colWidths: {}, containerW: 0, axisMin: AXIS_MIN, ...over });

describe("layoutColumns — 순서", () => {
    it("숨긴 열은 빠지고, 종목은 숨겨도 남는다(붙박이)", () => {
        const l = layout({ hiddenCols: ["date", "name", "ax:2"] });
        expect(l.displayCols.map(colKey)).toEqual(["name", "time", "ax:1"]);
    });

    it("고정 스택 순서 = frozenCols **배열 순서**(기본 열 순서가 아니라)", () => {
        const l = layout({ frozenCols: ["ax:1", "time"] });
        expect(l.displayCols.map(colKey)).toEqual(["name", "ax:1", "time", "date", "ax:2"]);
        expect(l.lastFrozenKey).toBe("time");
    });

    it("고정 스택의 sticky 오프셋은 앞선 고정 열 폭의 누적", () => {
        const l = layout({ frozenCols: ["date"] });
        expect(l.leftOf.get("name")).toBe(0);
        expect(l.leftOf.get("date")).toBe(COL_META.name.width);
        expect(l.leftOf.has("time")).toBe(false); // 비고정은 키 없음
    });

    it("frozenCols 의 유령 키(숨겨졌거나 사라진 열)는 조용히 무시", () => {
        const l = layout({ frozenCols: ["ax:9", "time"] });
        expect(l.displayCols.map(colKey)).toEqual(["name", "time", "date", "ax:1", "ax:2"]);
    });
});

describe("layoutColumns — 폭", () => {
    it("좁으면 축은 최소폭(가로 스크롤), 넓으면 남는 폭을 축들이 나눠 갖는다", () => {
        expect(layout({ containerW: 0 }).widthOf(ax("1"))).toBe(AXIS_MIN);

        const wide = layout({ containerW: 1000 });
        const others = COL_META.name.width + COL_META.date.width + COL_META.time.width;
        expect(wide.widthOf(ax("1"))).toBe(Math.floor((1000 - others) / 2));
        expect(wide.widthOf(ax("1"))).toBe(wide.widthOf(ax("2")));
    });

    it("수동 폭을 준 열은 그 값 그대로 — 그 열은 분배에서 빠지고 나머지 축이 잔여를 갖는다", () => {
        const l = layout({ containerW: 1000, colWidths: { "ax:1": 200 } });
        expect(l.widthOf(ax("1"))).toBe(200);
        const others = COL_META.name.width + COL_META.date.width + COL_META.time.width;
        expect(l.widthOf(ax("2"))).toBe(1000 - others - 200); // 남은 하나가 잔여 전부
    });

    it("축 전부에 수동 폭을 주면 전부 고정폭 — 총합이 컨테이너보다 좁아도 안 늘어난다(가로 스크롤 방향)", () => {
        const l = layout({ containerW: 2000, colWidths: { "ax:1": 100, "ax:2": 120 } });
        expect(l.widthOf(ax("1"))).toBe(100);
        expect(l.widthOf(ax("2"))).toBe(120);
        expect(l.tableW).toBeLessThan(2000);
    });

    it("비축 열도 수동 폭이 이긴다 / 폭을 지우면 기본 동작으로 정확히 복귀", () => {
        const manual = layout({ containerW: 1000, colWidths: { name: 300 } });
        expect(manual.widthOf({ key: "name" })).toBe(300);
        // 원위치(수동 폭 삭제) = 기본 계산과 동일해야 한다.
        expect(layout({ containerW: 1000, colWidths: {} }).tableW).toBe(layout({ containerW: 1000 }).tableW);
    });

    it("tableW = 표시 열 폭의 합", () => {
        const l = layout({ containerW: 1000 });
        expect(l.tableW).toBe(l.displayCols.reduce((s, c) => s + l.widthOf(c), 0));
    });
});

describe("reorderFrozenCols", () => {
    it("드래그한 키를 목표 자리로 옮긴다", () => {
        expect(reorderFrozenCols(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
        expect(reorderFrozenCols(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    });
    it("같은 자리·모르는 키는 원본 그대로(같은 배열)", () => {
        const cur = ["a", "b"];
        expect(reorderFrozenCols(cur, "a", "a")).toBe(cur);
        expect(reorderFrozenCols(cur, "z", "a")).toBe(cur);
    });
});

describe("pruneAxisKeys — 사라진 축의 유령 키 청소", () => {
    it("살아있는 축 키와 비축 키는 남기고 죽은 축 키만 버린다", () => {
        expect(pruneAxisKeys(["date", "ax:1", "ax:9"], ["1", "2"])).toEqual(["date", "ax:1"]);
        expect(pruneAxisKeys({ date: 80, "ax:9": 120 }, ["1"])).toEqual({ date: 80 });
    });
    it("버릴 게 없으면 같은 참조를 돌려준다(불필요한 상태 갱신 방지)", () => {
        const arr = ["date", "ax:1"];
        const obj = { "ax:1": 90 };
        expect(pruneAxisKeys(arr, ["1"])).toBe(arr);
        expect(pruneAxisKeys(obj, ["1"])).toBe(obj);
    });
});


describe("계산 축 열 — 고정폭", () => {
    it("분배에서 빠지고, 남는 폭은 판단 축들이 나눠 갖는다", () => {
        const l = layoutColumns({
            baseCols: [{ key: "name" }, cax("c"), ax("1"), ax("2")],
            frozenCols: [], hiddenCols: [], colWidths: {}, containerW: 1000, axisMin: AXIS_MIN,
        });
        const computedW = l.widthOf(cax("c"));
        expect(computedW).toBeGreaterThan(AXIS_MIN); // 값+순위가 들어갈 만큼
        expect(l.widthOf(ax("1"))).toBe(Math.floor((1000 - COL_META.name.width - computedW) / 2));
        expect(l.widthOf(ax("1"))).toBe(l.widthOf(ax("2")));
    });

    it("수동 폭은 계산 축에서도 이긴다", () => {
        const l = layoutColumns({
            baseCols: [{ key: "name" }, cax("c")],
            frozenCols: [], hiddenCols: [], colWidths: { "ax:c": 140 }, containerW: 1000, axisMin: AXIS_MIN,
        });
        expect(l.widthOf(cax("c"))).toBe(140);
    });
});
