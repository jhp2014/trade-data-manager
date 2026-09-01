// 그룹 목록의 줄 만들기 — 계층 펴기 · 겹침순 · 체인 관계 · 부모 지정 가능 여부.
//
// 여기서 지키는 건 "맵이 그림으로 말하던 것을 목록이 잃지 않는다"는 약속이다: 포함관계는 들여쓰기가,
// 좁혀지지 않는 걸음("포함")은 relationOf 가 맡는다. 방어(끊긴 사슬·순환)도 값이 아니라 **안 멈춤**이 본론이다.
import { describe, it, expect } from "vitest";
import type { Group } from "../../../api/groups.js";
import { canReparent, overlapRows, relationOf, treeRows } from "../groupList.js";

const g = (name: string, parentName: string | null = null): Group =>
    ({ name, parentName });

// 테마 ⊃ 소재 ⊃ 2차전지 · 테마 ⊃ 반도체 · 돌파(독립)
const GROUPS: Group[] = [g("테마"), g("소재", "테마"), g("2차전지", "소재"), g("반도체", "테마"), g("돌파")];
const byName = new Map(GROUPS.map((x) => [x.name, x]));
const names = (rows: readonly { group: Group }[]): string[] => rows.map((r) => r.group.name);

describe("treeRows — 계층 펴기", () => {
    it("부모 바로 밑에 자식이 붙는다", () => {
        expect(names(treeRows(GROUPS))).toEqual(["테마", "소재", "2차전지", "반도체", "돌파"]);
    });

    it("깊이와 자식 유무를 함께 준다 — 들여쓰기와 ▶ 가 그 값에서 나온다", () => {
        const rows = treeRows(GROUPS);
        expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1, 0]);
        expect(rows.map((r) => r.hasChildren)).toEqual([true, true, false, false, false]);
    });

    it("접으면 그 아래가 빠진다(자기 자신은 남는다)", () => {
        expect(names(treeRows(GROUPS, new Set(["소재"])))).toEqual(["테마", "소재", "반도체", "돌파"]);
    });

    it("**부모가 사전에 없으면 최상위로** — 안 그리면 만든 그룹이 조용히 사라진다", () => {
        const rows = treeRows([g("떠돌이", "지워진부모"), g("돌파")]);
        expect(names(rows)).toEqual(["떠돌이", "돌파"]);
        expect(rows[0]!.depth).toBe(0);
    });

    it("순환이면 멈추지 않는다 — 값이 조금 틀린 것과 화면이 멈추는 것은 대가가 다르다", () => {
        const rows = treeRows([g("A", "B"), g("B", "A")]);
        expect(rows.length).toBeLessThanOrEqual(2);
    });
});

describe("relationOf — `&` 칸이 무엇을 말할지", () => {
    it("체인에 든 것은 chain", () => {
        expect(relationOf("소재", ["소재"], byName)).toBe("chain");
    });

    it("체인 멤버의 **조상**은 contain — 교집합을 내도 체인이 그대로다", () => {
        expect(relationOf("테마", ["2차전지"], byName)).toBe("contain");
    });

    it("체인 멤버의 **자손**도 contain — 그 자손의 수가 그대로다", () => {
        expect(relationOf("2차전지", ["테마"], byName)).toBe("contain");
    });

    it("계층상 무관하면 other — 여기가 갈 수 있는 곳이다", () => {
        expect(relationOf("돌파", ["2차전지"], byName)).toBe("other");
    });

    it("체인이 비면 전부 other — 아직 아무것도 안 짚었다", () => {
        expect(relationOf("테마", [], byName)).toBe("other");
    });
});

describe("overlapRows — 겹침 큰 순서", () => {
    const cand = new Map([["돌파", 5], ["반도체", 2]]);

    it("짚은 것 · 갈 수 있는 곳(큰 순) · 포함 · 0 순서로 선다", () => {
        const rows = overlapRows(GROUPS, cand, ["2차전지"], byName);
        expect(names(rows)).toEqual(["2차전지", "돌파", "반도체", "소재", "테마"]);
    });

    it("계층을 접는다 — 값으로 세우는 화면이라 깊이가 없다", () => {
        expect(overlapRows(GROUPS, cand, ["2차전지"], byName).every((r) => r.depth === 0)).toBe(true);
    });

    it("같은 수면 이름순 — 순서가 렌더마다 흔들리지 않게", () => {
        const tie = new Map([["돌파", 3], ["반도체", 3]]);
        const rows = overlapRows(GROUPS, tie, ["2차전지"], byName);
        expect(names(rows).slice(0, 2)).toEqual(["2차전지", "돌파"]);
    });
});

describe("canReparent — 순환을 여기서 막는다", () => {
    it("자기 자신 밑으로는 못 간다", () => {
        expect(canReparent("소재", "소재", byName)).toBe(false);
    });

    it("**제 자손 밑으로는 못 간다** — 트리가 끊긴다", () => {
        expect(canReparent("테마", "2차전지", byName)).toBe(false);
    });

    it("이미 그 부모면 할 일이 없다", () => {
        expect(canReparent("소재", "테마", byName)).toBe(false);
    });

    it("무관한 그룹 밑으로는 갈 수 있다", () => {
        expect(canReparent("돌파", "테마", byName)).toBe(true);
    });

    it("최상위로 빼기는 부모가 있을 때만 뜻이 있다", () => {
        expect(canReparent("소재", null, byName)).toBe(true);
        expect(canReparent("돌파", null, byName)).toBe(false);
    });
});

