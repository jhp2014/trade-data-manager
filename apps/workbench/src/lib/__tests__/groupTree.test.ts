import { describe, it, expect } from "vitest";
import type { Group } from "../../api/groups.js";
import { ancestorsOf, groupPathLabel } from "../groupTree.js";

const g = (id: string, name: string, parentId: string | null = null): Group =>
    ({ id, name, scope: "day", parentId, mapId: null, x: null, y: null });

/** 대형주 › 반도체 › 소부장 · 그리고 최상위 하나. */
const dict = new Map<string, Group>([
    ["1", g("1", "대형주")],
    ["2", g("2", "반도체", "1")],
    ["3", g("3", "소부장", "2")],
    ["9", g("9", "돌파형")],
]);

describe("ancestorsOf — 먼 조상이 앞", () => {
    it("사슬을 위로 훑는다", () => {
        expect(ancestorsOf("3", dict).map((x) => x.name)).toEqual(["대형주", "반도체"]);
    });

    it("최상위는 조상이 없다", () => {
        expect(ancestorsOf("9", dict)).toEqual([]);
    });

    it("사전에 없는 그룹도 빈 배열(죽은 참조)", () => {
        expect(ancestorsOf("없음", dict)).toEqual([]);
    });

    it("끊긴 사슬은 거기서 멈춘다 — 지어내지 않는다", () => {
        const broken = new Map<string, Group>([["3", g("3", "소부장", "사라진부모")]]);
        expect(ancestorsOf("3", broken)).toEqual([]);
    });

    it("순환은 멈춘다 — 값이 조금 틀린 것과 화면이 멈추는 것은 대가가 다르다", () => {
        const cyclic = new Map<string, Group>([
            ["a", g("a", "A", "b")],
            ["b", g("b", "B", "a")],
        ]);
        expect(ancestorsOf("a", cyclic).map((x) => x.name)).toEqual(["B"]);
    });

    it("깊이 상한을 넘으면 자른다", () => {
        const deep = new Map<string, Group>();
        for (let i = 0; i < 30; i++) deep.set(`n${i}`, g(`n${i}`, `L${i}`, i === 29 ? null : `n${i + 1}`));
        expect(ancestorsOf("n0", deep).length).toBe(8);
    });
});

describe("groupPathLabel — 툴팁용 한 줄", () => {
    it("조상과 자신을 잇는다", () => {
        expect(groupPathLabel("3", dict, "?")).toBe("대형주 › 반도체 › 소부장");
    });

    it("지워진 그룹은 폴백 이름으로", () => {
        expect(groupPathLabel("없음", dict, "(지워짐)")).toBe("(지워짐)");
    });
});
