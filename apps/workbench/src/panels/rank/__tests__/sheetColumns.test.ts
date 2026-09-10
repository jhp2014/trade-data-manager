import { describe, it, expect } from "vitest";
import { COL_META, colKey, dropSide, layoutColumns, orderCols, placeCol, pruneAxisKeys, pruneDifKeys, pruneOutKeys, type Col } from "../sheetColumns.js";
import { sortKeyId, sortKeyOf } from "../sheetSort.js";
import { OUTCOME_COL_META } from "../outcomeColumns.js";

const ax = (id: string): Col => ({ key: "axis", axisId: id, name: `축${id}`, computed: false });
/** 계산 축 — 값이 들어가야 해서 고정폭(분배에서 빠진다). */
const cax = (id: string): Col => ({ key: "axis", axisId: id, name: `계산${id}`, computed: true });
const BASE: Col[] = [{ key: "name" }, { key: "date" }, { key: "time" }, ax("1"), ax("2")];
const AXIS_MIN = 56;

const layout = (over: Partial<Parameters<typeof layoutColumns>[0]> = {}) =>
    layoutColumns({ baseCols: BASE, frozenKeys: new Set<string>(), hiddenCols: [], colWidths: {}, containerW: 0, axisMin: AXIS_MIN, ...over });

describe("layoutColumns — 순서", () => {
    it("숨긴 열은 빠지고, 종목은 숨겨도 남는다(붙박이)", () => {
        const l = layout({ hiddenCols: ["date", "name", "ax:2"] });
        expect(l.displayCols.map(colKey)).toEqual(["name", "time", "ax:1"]);
    });

    it("고정은 소속만 말한다 — 스택 순서는 들어온 순서(열 순서 pref)가 정한다", () => {
        const l = layout({ frozenKeys: new Set(["ax:1", "time"]) });
        // 고정을 걸어도 자리가 안 튄다: time 이 ax:1 보다 앞이라는 목록 순서가 스택에서도 유지된다.
        expect(l.displayCols.map(colKey)).toEqual(["name", "time", "ax:1", "date", "ax:2"]);
        expect(l.lastFrozenKey).toBe("ax:1");
    });

    it("고정 스택의 sticky 오프셋은 앞선 고정 열 폭의 누적", () => {
        const l = layout({ frozenKeys: new Set(["date"]) });
        expect(l.leftOf.get("name")).toBe(0);
        expect(l.leftOf.get("date")).toBe(COL_META.name.width);
        expect(l.leftOf.has("time")).toBe(false); // 비고정은 키 없음
    });

    it("고정 집합의 유령 키(숨겨졌거나 사라진 열)는 조용히 무시", () => {
        const l = layout({ frozenKeys: new Set(["ax:9", "time"]) });
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

describe("dropSide — 방향은 손이 움직인 줄(화면 순서)로 읽는다", () => {
    it("뒤로 끌면 target 뒤, 앞으로 끌면 target 앞", () => {
        expect(dropSide(["a", "b", "c"], "a", "c")).toBe("after");
        expect(dropSide(["a", "b", "c"], "c", "a")).toBe("before");
    });
    it("같은 자리·모르는 키는 null", () => {
        expect(dropSide(["a", "b"], "a", "a")).toBeNull();
        expect(dropSide(["a", "b"], "z", "a")).toBeNull();
    });
});

describe("placeCol — 움직이는 건 끌린 열 하나뿐", () => {
    it("target 의 앞/뒤로 넣는다", () => {
        expect(placeCol(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
        expect(placeCol(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
    });
    it("나머지 열의 상대 순서는 그대로다", () => {
        expect(placeCol(["a", "b", "c", "d"], "a", "c", "after")).toEqual(["b", "c", "a", "d"]);
    });
    it("바뀔 게 없으면 null — 이미 그 자리면 저장하지 않는다", () => {
        expect(placeCol(["a", "b", "c"], "a", "b", "before")).toBeNull();
        expect(placeCol(["a", "b", "c"], "b", "a", "after")).toBeNull();
        expect(placeCol(["a", "b"], "z", "a", "after")).toBeNull();
    });
});

describe("orderCols — 열 순서 pref 입히기", () => {
    it("pref 가 비면 기본 순서 그대로", () => {
        expect(orderCols(BASE, []).map(colKey)).toEqual(BASE.map(colKey));
    });

    it("pref 가 주 순서다 — 종류를 안 가리고 옮긴다", () => {
        expect(orderCols(BASE, ["ax:2", "name", "date", "time", "ax:1"]).map(colKey))
            .toEqual(["ax:2", "name", "date", "time", "ax:1"]);
    });

    it("pref 에 없는 열은 맨 뒤가 아니라 **제 자리**에 선다(새 축이 축 무리에서 안 떨어지게)", () => {
        // 새로 생긴 ax:2 가 pref 에 없다 — 앞선 열(…ax:1)의 뒤이자 pref 의 다음 키 앞.
        expect(orderCols(BASE, ["name", "date", "time", "ax:1"]).map(colKey))
            .toEqual(["name", "date", "time", "ax:1", "ax:2"]);
        // 축 자리를 바꿔 뒀어도 마찬가지 — 새 열은 자기보다 앞서던 열 전부의 뒤다.
        expect(orderCols(BASE, ["name", "ax:1", "date", "time"]).map(colKey))
            .toEqual(["name", "ax:1", "date", "time", "ax:2"]);
    });

    it("모르는 열은 **앞선 열 전부**의 뒤다 — 가까운 이웃 하나만 보면 무리 사이로 끼어든다", () => {
        // 부분 pref(마이그레이션 시딩의 모양): 축만 순서가 있고 결과 열 둘은 pref 에 없다.
        // ax:2 를 앞으로 끌어 뒀어도 결과 열은 **축 전부의 뒤**에 서야 한다("가까운 앞 이웃"이면 ax:2 뒤).
        const withOut: Col[] = [...BASE, { key: "out", metric: "extHigh" }, { key: "out", metric: "status" }];
        expect(orderCols(withOut, ["name", "date", "time", "ax:2", "ax:1"]).map(colKey))
            .toEqual(["name", "date", "time", "ax:2", "ax:1", "out:extHigh", "out:status"]);
    });

    it("pref 의 죽은 키(지금 없는 열)는 결과에 안 나온다 — 저장물에는 남는다(청소 effect 몫)", () => {
        expect(orderCols(BASE, ["ax:9", "ax:2"]).map(colKey))
            .toEqual(["name", "date", "time", "ax:1", "ax:2"]);
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
    it("결과 열 키(`out:`)는 축이 아니라 안 건드린다 — 이름공간이 갈려 있는 이유", () => {
        const arr = ["out:extHigh", "ax:9"];
        expect(pruneAxisKeys(arr, ["1"])).toEqual(["out:extHigh"]);
    });
});

describe("pruneOutKeys — 지워진 자리(부품·인스턴스)의 유령 열 키 청소", () => {
    it("태그형 4조각만 대상 — 붙박이 2조각·축·기본 열은 무접촉", () => {
        expect(pruneOutKeys(["out:extHigh", "out:p:fs1:extHigh", "out:p:fs9:extHigh", "out:i:s1:extHigh", "out:i:s9:extHigh", "ax:9", "date"], ["fs1"], ["s1"]))
            .toEqual(["out:extHigh", "out:p:fs1:extHigh", "out:i:s1:extHigh", "ax:9", "date"]);
        expect(pruneOutKeys({ "out:p:fs9:status": 80, "out:status": 60 }, [], [])).toEqual({ "out:status": 60 });
    });
    it("태그 없는 옛 3조각은 전부 유령 — 하루짜리 형식이라 살릴 게 없다", () => {
        expect(pruneOutKeys(["out:fs1:extHigh", "out:extHigh"], ["fs1"], [])).toEqual(["out:extHigh"]);
    });
    it("버릴 게 없으면 같은 참조", () => {
        const arr = ["out:extHigh", "out:p:fs1:extHigh", "out:i:s1:extHigh"];
        expect(pruneOutKeys(arr, ["fs1"], ["s1"])).toBe(arr);
    });
});

describe("pruneDifKeys — 사라진 차이 열의 유령 키 청소", () => {
    it("`dif:` 만 대상", () => {
        expect(pruneDifKeys(["dif:d1", "dif:d9", "out:extHigh"], ["d1"])).toEqual(["dif:d1", "out:extHigh"]);
        const arr = ["dif:d1"];
        expect(pruneDifKeys(arr, ["d1"])).toBe(arr);
    });
});

describe("결과 열(out) — 시트 전용 소스의 열", () => {
    const out = (metric: "extHigh" | "status"): Col => ({ key: "out", metric });
    it("colKey 이름공간 = `out:<id>`(축 `ax:` 와 구분)", () => {
        expect(colKey(out("extHigh"))).toBe("out:extHigh");
    });
    it("갈라진 열 — colKey = `out:<태그>:<id>:<metric>` 이고 정렬 키 id 와 **같은 문자열**(열 설정·정렬이 키를 공유)", () => {
        const part: Col = { key: "out", metric: "extHigh", scope: { kind: "part", id: "fs1", name: "눌림A", color: "#000" } };
        const inst: Col = { key: "out", metric: "extHigh", scope: { kind: "inst", id: "s9", name: "T 5%", color: "#000" } };
        expect(colKey(part)).toBe("out:p:fs1:extHigh");
        expect(colKey(inst)).toBe("out:i:s9:extHigh");
        expect(sortKeyId(sortKeyOf(part))).toBe(colKey(part));
        expect(sortKeyId(sortKeyOf(inst))).toBe(colKey(inst));
        // 셋은 서로 다른 키다 — 기준이 다른 값이라 설정도 갈려야 한다(부품 = 모수, 인스턴스 = T).
        expect(new Set([colKey(part), colKey(inst), colKey(out("extHigh"))]).size).toBe(3);
    });

    it("차이 열 — colKey = `dif:<id>`(피연산자를 주소로 쓰지 않는다 — 한쪽 T 를 만질 때마다 설정이 리셋된다)", () => {
        const c: Col = { key: "dif", id: "d1", a: "out:i:s1:extHigh", b: "out:i:s2:extHigh" };
        expect(colKey(c)).toBe("dif:d1");
        expect(sortKeyId(sortKeyOf(c))).toBe("dif:d1");
    });
    it("고정폭이다 — 축 잔여 분배에 안 낀다(값·부호가 잘리면 존재 이유가 없다)", () => {
        const l = layoutColumns({
            baseCols: [{ key: "name" }, out("extHigh"), ax("1"), ax("2")],
            frozenKeys: new Set<string>(), hiddenCols: [], colWidths: {}, containerW: 1000, axisMin: AXIS_MIN,
        });
        expect(l.widthOf(out("extHigh"))).toBe(OUTCOME_COL_META.extHigh.width); // OUTCOME_COL_META 폭 그대로
        expect(l.widthOf(ax("1"))).toBe(l.widthOf(ax("2"))); // 남는 폭은 축끼리만 분배
        expect(l.widthOf(ax("1"))).toBeGreaterThan(AXIS_MIN);
    });
});


describe("계산 축 열 — 고정폭", () => {
    it("분배에서 빠지고, 남는 폭은 판단 축들이 나눠 갖는다", () => {
        const l = layoutColumns({
            baseCols: [{ key: "name" }, cax("c"), ax("1"), ax("2")],
            frozenKeys: new Set<string>(), hiddenCols: [], colWidths: {}, containerW: 1000, axisMin: AXIS_MIN,
        });
        const computedW = l.widthOf(cax("c"));
        expect(computedW).toBeGreaterThan(AXIS_MIN); // 값 하나가 안 잘릴 만큼
        expect(l.widthOf(ax("1"))).toBe(Math.floor((1000 - COL_META.name.width - computedW) / 2));
        expect(l.widthOf(ax("1"))).toBe(l.widthOf(ax("2")));
    });

    it("수동 폭은 계산 축에서도 이긴다", () => {
        const l = layoutColumns({
            baseCols: [{ key: "name" }, cax("c")],
            frozenKeys: new Set<string>(), hiddenCols: [], colWidths: { "ax:c": 140 }, containerW: 1000, axisMin: AXIS_MIN,
        });
        expect(l.widthOf(cax("c"))).toBe(140);
    });
});
