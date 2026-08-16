import { describe, it, expect } from "vitest";
import type { Group } from "../../api/groups.js";
import { ancestorsOf, expandWithAncestors, groupPathLabel, inheritanceSources, isAncestorOf } from "../groupTree.js";

const g = (name: string, parentName: string | null = null): Group =>
    ({ name, scope: "day", parentName, mapName: null, x: null, y: null });

/** 대형주 › 반도체 › 소부장 · 그리고 최상위 하나. **키가 곧 이름**이다(이름이 정체성). */
const dict = new Map<string, Group>([
    ["대형주", g("대형주")],
    ["반도체", g("반도체", "대형주")],
    ["소부장", g("소부장", "반도체")],
    ["돌파형", g("돌파형")],
]);

describe("ancestorsOf — 먼 조상이 앞", () => {
    it("사슬을 위로 훑는다", () => {
        expect(ancestorsOf("소부장", dict).map((x) => x.name)).toEqual(["대형주", "반도체"]);
    });

    it("최상위는 조상이 없다", () => {
        expect(ancestorsOf("돌파형", dict)).toEqual([]);
    });

    it("사전에 없는 그룹도 빈 배열(죽은 참조)", () => {
        expect(ancestorsOf("없음", dict)).toEqual([]);
    });

    it("끊긴 사슬은 거기서 멈춘다 — 지어내지 않는다", () => {
        const broken = new Map<string, Group>([["소부장", g("소부장", "사라진부모")]]);
        expect(ancestorsOf("소부장", broken)).toEqual([]);
    });

    it("순환은 멈춘다 — 값이 조금 틀린 것과 화면이 멈추는 것은 대가가 다르다", () => {
        const cyclic = new Map<string, Group>([
            ["A", g("A", "B")],
            ["B", g("B", "A")],
        ]);
        expect(ancestorsOf("A", cyclic).map((x) => x.name)).toEqual(["B"]);
    });

    it("깊이 상한을 넘으면 자른다", () => {
        const deep = new Map<string, Group>();
        for (let i = 0; i < 30; i++) deep.set(`L${i}`, g(`L${i}`, i === 29 ? null : `L${i + 1}`));
        expect(ancestorsOf("L0", deep).length).toBe(8);
    });
});

describe("groupPathLabel — 툴팁용 한 줄", () => {
    it("조상과 자신을 잇는다", () => {
        expect(groupPathLabel("소부장", dict, "?")).toBe("대형주 › 반도체 › 소부장");
    });

    it("지워진 그룹은 폴백 이름으로", () => {
        expect(groupPathLabel("없음", dict, "(지워짐)")).toBe("(지워짐)");
    });
});

describe("expandWithAncestors — 적용 집합(직접 ∪ 조상)", () => {
    it("직접이 앞, 조상이 뒤", () => {
        expect(expandWithAncestors(["소부장"], dict)).toEqual(["소부장", "대형주", "반도체"]);
    });

    it("조상이 이미 직접이면 중복으로 안 늘어난다", () => {
        expect(expandWithAncestors(["소부장", "반도체"], dict)).toEqual(["소부장", "반도체", "대형주"]);
    });

    it("최상위만 있으면 그대로 — 같은 내용이면 복사만", () => {
        expect(expandWithAncestors(["돌파형"], dict)).toEqual(["돌파형"]);
    });

    it("빈 입력은 빈 배열", () => {
        expect(expandWithAncestors([], dict)).toEqual([]);
    });

    it("죽은 참조는 조상 없이 그대로 남는다", () => {
        expect(expandWithAncestors(["없음"], dict)).toEqual(["없음"]);
    });
});

describe("inheritanceSources — 조상 ← 어느 직접 그룹 경유인가", () => {
    it("조상마다 가져온 직접 그룹을 가리킨다", () => {
        const via = inheritanceSources(["소부장"], dict);
        expect(via.get("대형주")?.name).toBe("소부장");
        expect(via.get("반도체")?.name).toBe("소부장");
    });

    it("직접 소속인 이름은 키에 없다 — 상속이 아니라 소유", () => {
        const via = inheritanceSources(["소부장", "반도체"], dict);
        expect(via.has("반도체")).toBe(false);
        expect(via.get("대형주")?.name).toBe("소부장");
    });

    it("직접이 없으면 비어 있다", () => {
        expect(inheritanceSources([], dict).size).toBe(0);
    });
});

describe("isAncestorOf — 겹침 계산의 조상–자손 쌍 거름망", () => {
    it("조상이면 참, 반대 방향이면 거짓", () => {
        expect(isAncestorOf("대형주", "소부장", dict)).toBe(true);
        expect(isAncestorOf("소부장", "대형주", dict)).toBe(false);
    });

    it("자기 자신은 조상이 아니다", () => {
        expect(isAncestorOf("소부장", "소부장", dict)).toBe(false);
    });

    it("무관한 둘은 거짓", () => {
        expect(isAncestorOf("돌파형", "소부장", dict)).toBe(false);
    });
});
