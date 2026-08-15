import { describe, it, expect } from "vitest";
import type { Group, GroupMembership } from "../../../api/groups.js";
import { chainCandidates, selectionGraph, membersOfAll, populationCounts, populationFeed, type PopulationItem } from "../mapView.js";

const grp = (id: string, parentId: string | null = null): Group =>
    ({ id, name: id, scope: "day", parentId, mapId: "m", x: 0, y: 0 });

// 테마 ▸ 2차전지 · 갭상승(무관)
const byId = new Map<string, Group>([["테마", grp("테마")], ["2차전지", grp("2차전지", "테마")], ["갭상승", grp("갭상승")]]);

const item = (code: string, groups: string[]): { it: PopulationItem; ids: string[] } =>
    ({ it: { stockCode: code, date: "2026-07-01" }, ids: groups });

const row = (code: string, groupIds: string[]): GroupMembership => ({ stockCode: code, date: "d", groupIds });

describe("populationFeed — 항목당 적용 집합 판정 1회", () => {
    it("주입된 판정 그대로 의사 피드가 된다", () => {
        const rows = [item("A", ["2차전지", "테마"]), item("B", [])];
        const feed = populationFeed(rows.map((r) => r.it), (i) => rows.find((r) => r.it.stockCode === i.stockCode)!.ids);
        expect(feed).toHaveLength(2);
        expect(feed[0]!.groupIds).toEqual(["2차전지", "테마"]);
    });

    it("시각 있는 항목은 시각을 보존한다(목록 행 클릭 = 타점 이동의 재료)", () => {
        const feed = populationFeed([{ stockCode: "A", date: "2026-07-01", time: "09:30:00" }], () => []);
        expect(feed[0]!.time).toBe("09:30:00");
    });
});

describe("populationCounts — 노드 안 숫자(절대값)", () => {
    it("적용 집합 기준이라 자식 소속이 부모에도 센다", () => {
        const c = populationCounts([row("A", ["2차전지", "테마"]), row("B", ["테마"])]);
        expect(c.get("테마")).toBe(2);
        expect(c.get("2차전지")).toBe(1);
    });
});

describe("membersOfAll — 체인이 공통으로 가진 항목", () => {
    const feed = [row("A", ["돌파", "갭상승"]), row("B", ["돌파"]), row("C", ["갭상승"])];

    it("전부 가진 것만 남는다(AND)", () => {
        expect(membersOfAll(feed, ["돌파", "갭상승"]).map((m) => m.stockCode)).toEqual(["A"]);
    });

    it("하나면 그 그룹의 멤버", () => {
        expect(membersOfAll(feed, ["돌파"]).map((m) => m.stockCode)).toEqual(["A", "B"]);
    });

    it("빈 체인은 전부 — 분모가 통째로 사라지지 않게", () => {
        expect(membersOfAll(feed, [])).toHaveLength(3);
    });
});

describe("chainCandidates — 한 걸음 더 갈 수 있는 곳", () => {
    // A: 돌파+갭상승+눌림 · B: 돌파+갭상승 · C: 돌파 · D: 갭상승
    const feed = [
        row("A", ["돌파", "갭상승", "눌림"]),
        row("B", ["돌파", "갭상승"]),
        row("C", ["돌파"]),
        row("D", ["갭상승"]),
    ];

    it("체인이 없으면 후보도 없다 — 짚기 전엔 아무 선도 안 그린다", () => {
        expect(chainCandidates(feed, []).size).toBe(0);
    });

    it("한 걸음: 체인 ∧ 후보 수", () => {
        const c = chainCandidates(feed, ["돌파"]);
        expect(c.get("갭상승")).toBe(2); // A·B
        expect(c.get("눌림")).toBe(1); // A
    });

    it("두 걸음: 교집합이 깊어진다 — 이게 드릴다운이다", () => {
        const c = chainCandidates(feed, ["돌파", "갭상승"]);
        expect(c.get("눌림")).toBe(1); // A 만 셋 다 가짐
    });

    it("체인에 든 그룹은 후보가 아니다", () => {
        expect(chainCandidates(feed, ["돌파"]).has("돌파")).toBe(false);
    });

    it("교집합 0인 그룹은 아예 안 담는다 — '갈 수 있는 곳'만 남긴다", () => {
        const c = chainCandidates([row("A", ["돌파"]), row("B", ["눌림"])], ["돌파"]);
        expect(c.has("눌림")).toBe(false);
    });

    it("조상·자손은 뺀다 — 포함관계는 컨테이너 영역이 이미 보여준다", () => {
        const f = [row("A", ["2차전지", "테마", "갭상승"])];
        const c = chainCandidates(f, ["2차전지"], { groupById: byId });
        expect(c.has("테마")).toBe(false);
        expect(c.get("갭상승")).toBe(1);
    });

    it("within 밖 그룹은 후보가 아니다(평면에 안 올린 그룹)", () => {
        const c = chainCandidates(feed, ["돌파"], { within: new Set(["돌파", "눌림"]) });
        expect(c.has("갭상승")).toBe(false);
        expect(c.get("눌림")).toBe(1);
    });
});

describe("selectionGraph — 고른 것들의 교집합을 가운데 세운다", () => {
    // A(왼쪽 위) · B(오른쪽) · C(아래)
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {
        A: { x: 0, y: 0, w: 100, h: 32 },
        B: { x: 400, y: 0, w: 100, h: 32 },
        C: { x: 0, y: 400, w: 100, h: 32 },
    };
    const boxOf = (id: string) => boxes[id];

    it("아무것도 안 고르면 아무것도 안 그린다", () => {
        const g = selectionGraph([], new Map([["B", 3]]), boxOf, 0);
        expect(g.mid).toBeNull();
        expect(g.links).toEqual([]);
    });

    it("하나만 고르면 교집합 노드가 없다 — 제 자신이 곧 그 집합이다", () => {
        const g = selectionGraph(["A"], new Map([["B", 3]]), boxOf, 40);
        expect(g.mid).toBeNull();
        expect(g.links).toHaveLength(1);
        expect(g.links[0]).toMatchObject({ from: "A", to: "B", count: 3, traversed: false });
    });

    it("둘 이상 고르면 가운데에 교집합 노드가 서고 고른 것들이 거기로 이어진다", () => {
        const g = selectionGraph(["A", "B"], new Map(), boxOf, 7);
        expect(g.mid).toMatchObject({ count: 7, members: ["A", "B"] });
        // A 중심(50,16) 과 B 중심(450,16) 의 한가운데
        expect(g.mid!.center).toEqual({ x: 250, y: 16 });
        expect(g.links.map((l) => [l.from, l.to])).toEqual([["A", "mid"], ["B", "mid"]]);
    });

    it("후보 선은 **교집합에서** 나간다 — 고른 것 하나에서가 아니라", () => {
        const g = selectionGraph(["A", "B"], new Map([["C", 2]]), boxOf, 7);
        const cand = g.links.filter((l) => !l.traversed);
        expect(cand).toHaveLength(1);
        expect(cand[0]).toMatchObject({ from: "mid", to: "C", count: 2 });
    });

    // 교집합은 대칭이라 고른 순서가 그림을 바꾸면 안 된다.
    it("고른 순서가 달라도 같은 그림", () => {
        const a = selectionGraph(["A", "B"], new Map([["C", 2]]), boxOf, 7);
        const b = selectionGraph(["B", "A"], new Map([["C", 2]]), boxOf, 7);
        expect(a.mid!.center).toEqual(b.mid!.center);
        expect(a.links.map((l) => l.to).sort()).toEqual(b.links.map((l) => l.to).sort());
    });

    it("붙는 변은 상대 위치가 정한다 — 오른쪽 이웃이면 r→l", () => {
        const g = selectionGraph(["A"], new Map([["B", 1]]), boxOf, 40);
        expect(g.links[0]).toMatchObject({ fromSide: "r", toSide: "l" });
    });

    it("상자를 못 찾는 그룹은 조용히 버린다(막 내려간 것)", () => {
        expect(selectionGraph(["없음"], new Map([["B", 1]]), boxOf, 0).links).toEqual([]);
        expect(selectionGraph(["A"], new Map([["없음", 1]]), boxOf, 40).links).toEqual([]);
    });
});
