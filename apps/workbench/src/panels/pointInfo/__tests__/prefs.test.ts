import { describe, it, expect } from "vitest";
import { moveRow, orderRows, pruneRowKeys } from "../prefs.js";
import type { PointInfoRow } from "../rows.js";

const row = (key: string): PointInfoRow => ({
    key, kind: "axis", name: key, value: { text: "1", color: "", numeric: true, badge: null }, title: key, revealKey: key,
});

describe("pruneRowKeys — 유령 청소", () => {
    const live = { axisKeys: ["c:a1", "c:a2"], themes: ["반도체", "2차전지"] };

    it("죽은 축·테마 키만 지운다.", () => {
        const got = pruneRowKeys(["ax:c:a1", "ax:c:dead", "th:반도체", "th:사라진테마"], live);
        expect(got).toEqual(["ax:c:a1", "th:반도체"]);
    });

    it("`th:` 의 생사는 **전체 테마 목록**이 정한다 — 시선 종목의 테마로 재면 종목을 옮길 때마다 남의 키가 죽는다.", () => {
        // 지금 화면엔 "반도체" 하나만 서 있어도, 다른 종목의 테마 키는 살아남아야 한다.
        const got = pruneRowKeys(["th:반도체", "th:2차전지"], live);
        expect(got).toEqual(["th:반도체", "th:2차전지"]);
    });

    it("`out:` 은 붙박이라 절대 안 지운다(목록을 안 받는 이유).", () => {
        expect(pruneRowKeys(["out:extHigh", "out:simStatus"], { axisKeys: [], themes: [] }))
            .toEqual(["out:extHigh", "out:simStatus"]);
    });

    it("바뀔 게 없으면 같은 배열을 돌려준다(영속 쓰기가 안 돌게).", () => {
        const cur = ["ax:c:a1", "th:반도체"];
        expect(pruneRowKeys(cur, live)).toBe(cur);
    });
});

describe("orderRows — 사용자 순서", () => {
    it("pref 가 주 순서고, pref 에 없는 줄은 기본 순서상 제 앞 이웃들 뒤에 선다.", () => {
        const rows = [row("a"), row("b"), row("c"), row("d")];
        expect(orderRows(rows, ["c", "a"]).map((r) => r.key)).toEqual(["c", "a", "b", "d"]);
    });

    it("pref 가 비면 기본 순서 그대로.", () => {
        const rows = [row("a"), row("b")];
        expect(orderRows(rows, []).map((r) => r.key)).toEqual(["a", "b"]);
    });
});

describe("moveRow — 드래그 한 번", () => {
    const all = ["a", "b", "c", "d"];

    it("뒤로 끌면 뒤, 앞으로 끌면 앞(방향은 화면 순서로 읽는다).", () => {
        expect(moveRow(all, all, all, "a", "c")).toEqual(["b", "c", "a", "d"]);
        expect(moveRow(all, all, all, "d", "b")).toEqual(["a", "d", "b", "c"]);
    });

    it("바뀔 게 없으면 null — 쓸데없는 저장을 안 한다.", () => {
        expect(moveRow(all, all, all, "a", "a")).toBeNull();
        expect(moveRow(all, all, ["a", "b"], "a", "c")).toBeNull(); // 화면에 없는 대상 = 방향 불명
    });

    it("⚠ 드래그는 **순서만** 바꾸고 키를 안 지운다 — 지금 화면에 없는 줄(서랍·다른 종목 테마)의 자리는 되끼운다.", () => {
        // 저장된 순서엔 남의 테마 키가 있고, 지금 목록(all)엔 없다.
        const prev = ["a", "th:남의테마", "b", "c"];
        const got = moveRow(prev, all, all, "c", "a")!;
        expect(got).toContain("th:남의테마");
        expect(got.indexOf("c")).toBeLessThan(got.indexOf("a")); // 이동은 실제로 일어났다
    });

    it("본문에 없는 줄은 드롭 대상이 못 된다(방향을 읽을 화면 순서가 없다).", () => {
        expect(moveRow(all, all, ["a", "b"], "a", "d")).toBeNull();
    });
});
