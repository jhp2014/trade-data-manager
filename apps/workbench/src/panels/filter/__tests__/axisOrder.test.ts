// 보드 레일 순서(순수) — 표시선과 실제 결과가 **같은 셈**에서 나오는지가 이 파일의 요점이다.
// 어긋나면 손이 놓은 자리와 축이 서는 자리가 달라지는데, 그건 드래그를 못 믿게 만든다.
import { describe, it, expect } from "vitest";
import { dropEdge, moveAxis, orderAxes, parseAxisOrder } from "../axisOrder.js";

const ax = (key: string): { key: string } => ({ key });
const keys = (a: readonly { key: string }[]): string[] => a.map((x) => x.key);

describe("orderAxes", () => {
    it("pref 가 비면 들어온 순서 그대로 — 한 번도 안 옮겼으면 화면이 안 바뀐다", () => {
        expect(keys(orderAxes([ax("a"), ax("b"), ax("c")], []))).toEqual(["a", "b", "c"]);
    });

    it("pref 순서를 입힌다", () => {
        expect(keys(orderAxes([ax("a"), ax("b"), ax("c")], ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
    });

    it("pref 에 없는 축은 뒤로, 그 안에서는 들어온 순서 — 새 축이 조용히 앞에 끼지 않는다", () => {
        expect(keys(orderAxes([ax("new1"), ax("b"), ax("new2"), ax("a")], ["a", "b"])))
            .toEqual(["a", "b", "new1", "new2"]);
    });

    it("pref 의 죽은 id 는 그냥 없는 것 — 지워진 축이 자리를 잡아먹지 않는다", () => {
        expect(keys(orderAxes([ax("a"), ax("b")], ["gone", "b", "a"]))).toEqual(["b", "a"]);
    });
});

describe("moveAxis", () => {
    it("아래로 — target 뒤에 선다", () => {
        expect(moveAxis(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    });

    it("위로 — target 앞에 선다", () => {
        expect(moveAxis(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    });

    it("제자리·목록 밖은 null — 쓸데없는 저장을 안 한다", () => {
        expect(moveAxis(["a", "b"], "a", "a")).toBeNull();
        expect(moveAxis(["a", "b"], "z", "a")).toBeNull();
        expect(moveAxis(["a", "b"], "a", "z")).toBeNull();
    });
});

describe("dropEdge — 표시선은 moveAxis 와 같은 셈이어야 한다", () => {
    it("아래로 끌면 after · 위로 끌면 before", () => {
        expect(dropEdge(["a", "b", "c"], "a", "c")).toBe("after");
        expect(dropEdge(["a", "b", "c"], "c", "a")).toBe("before");
    });

    it("그릴 게 없으면 null", () => {
        expect(dropEdge(["a", "b"], "a", "a")).toBeNull();
        expect(dropEdge(["a", "b"], "z", "a")).toBeNull();
    });

    // ⚠ 이 검사가 둘의 일치를 실제로 잰다 — 각각의 단위 검사만으로는 갈라져도 둘 다 통과한다.
    it("표시선이 말한 자리에 실제로 선다(전 조합)", () => {
        const ids = ["a", "b", "c", "d"];
        for (const dragged of ids) {
            for (const target of ids) {
                const edge = dropEdge(ids, dragged, target);
                const next = moveAxis(ids, dragged, target);
                if (edge === null) { expect(next).toBeNull(); continue; }
                const at = next!.indexOf(dragged);
                const targetAt = next!.indexOf(target);
                expect(edge === "after" ? at === targetAt + 1 : at === targetAt - 1).toBe(true);
            }
        }
    });
});

describe("parseAxisOrder", () => {
    it("문자열 배열만 받는다 — 깨진 저장본은 통째로 버리고 기본 순서로", () => {
        expect(parseAxisOrder(["a", "b"])).toEqual(["a", "b"]);
        expect(parseAxisOrder([])).toEqual([]);
        expect(parseAxisOrder(["a", 3])).toBeNull();
        expect(parseAxisOrder({ a: 1 })).toBeNull();
        expect(parseAxisOrder(null)).toBeNull();
    });
});
