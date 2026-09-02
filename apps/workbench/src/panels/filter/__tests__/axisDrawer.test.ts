// 서랍(순수) — 무엇이 어디에 서고, 무엇을 세나.
// 화면 배선은 FilterBoard.dom 이 덮는다. 여기는 그 규칙들의 대수만.
import { describe, it, expect } from "vitest";
import {
    drawerCountsOf, drawerVisible, parseDrawerIds, parseDrawerOpen, pruneDrawer, splitByDrawer,
} from "../axisDrawer.js";

const ax = (key: string): { key: string } => ({ key });

describe("parseDrawerIds / parseDrawerOpen", () => {
    it("모양이 다르면 통째로 버린다 — 깨진 pref 로 화면이 이상해지는 것보다 기본값이 낫다", () => {
        expect(parseDrawerIds(["c:a"])).toEqual(["c:a"]);
        expect(parseDrawerIds([1, "c:a"])).toBeNull();
        expect(parseDrawerIds({})).toBeNull();
        expect(parseDrawerOpen({ day: true })).toEqual({ day: true });
        expect(parseDrawerOpen({ day: "yes" })).toBeNull();
        expect(parseDrawerOpen(["day"])).toBeNull();
    });
});

describe("pruneDrawer", () => {
    it("사라진 축의 유령 id 를 지운다", () => {
        expect(pruneDrawer(["c:a", "c:dead"], ["c:a", "c:b"])).toEqual(["c:a"]);
    });

    it("지울 게 없으면 **같은 배열**을 돌려준다 — 새 참조는 무의미한 영속 쓰기를 부른다", () => {
        const ids = ["c:a"];
        expect(pruneDrawer(ids, ["c:a", "c:b"])).toBe(ids);
    });

    it("보호 키(렌즈로 잠깐 숨은 축)는 목록에 없어도 지우지 않는다 — 렌즈를 되돌릴 때마다 서랍이 비는 사고 방지", () => {
        const ids = ["c:a", "c:grid-high-min"];
        expect(pruneDrawer(ids, ["c:a"], ["c:grid-high-min"])).toBe(ids);
        expect(pruneDrawer(["c:a", "c:grid-high-min", "c:dead"], ["c:a"], ["c:grid-high-min"])).toEqual(["c:a", "c:grid-high-min"]);
    });
});

describe("splitByDrawer", () => {
    it("들어온 순서를 양쪽 다 지킨다 — 레일 순서가 서랍 안에서도 같아야 한다", () => {
        const { outside, inside } = splitByDrawer([ax("c:a"), ax("c:b"), ax("c:c")], new Set(["c:b"]));
        expect(outside.map((a) => a.key)).toEqual(["c:a", "c:c"]);
        expect(inside.map((a) => a.key)).toEqual(["c:b"]);
    });
});

describe("drawerCountsOf / drawerVisible", () => {
    const inside = [ax("c:a"), ax("c:b"), ax("c:c")];
    const conditioned = (k: string): boolean => k === "c:b";

    it("든 축 수와 그중 조건 걸린 수를 함께 센다", () => {
        expect(drawerCountsOf(inside, conditioned)).toEqual({ total: 3, conditioned: 1 });
    });

    it("빈 서랍은 줄도 안 그린다", () => {
        expect(drawerVisible({ total: 0, conditioned: 0 }, false)).toBe(false);
    });

    it("'걸린 것만 보기'에선 조건 걸린 축이 있어야 그린다 — 못 찾을 축을 세어 봐야 소용없다", () => {
        expect(drawerVisible({ total: 3, conditioned: 0 }, true)).toBe(false);
        expect(drawerVisible({ total: 3, conditioned: 1 }, true)).toBe(true);
        expect(drawerVisible({ total: 3, conditioned: 0 }, false)).toBe(true);
    });
});
