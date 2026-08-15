import { describe, it, expect } from "vitest";
import type { Group, GroupMembership } from "../../../api/groups.js";
import { chainCandidates, chainGraph, membersOfAll, populationCounts, populationFeed, type PopulationItem } from "../mapView.js";

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

describe("chainGraph — 교집합을 물체로 세운다", () => {
    // A(왼쪽 위) · B(오른쪽) · C(아래)
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {
        A: { x: 0, y: 0, w: 100, h: 32 },
        B: { x: 400, y: 0, w: 100, h: 32 },
        C: { x: 0, y: 400, w: 100, h: 32 },
    };
    const boxOf = (id: string) => boxes[id];
    const countOf = (prefix: readonly string[]): number => prefix.length * 10; // 자리표시자

    it("체인이 비면 아무것도 안 그린다 — 짚기 전엔 깨끗하다", () => {
        const g = chainGraph([], new Map([["B", 3]]), boxOf, countOf);
        expect(g.mids).toEqual([]);
        expect(g.links).toEqual([]);
    });

    it("후보마다 교집합 노드 하나 + 선 둘(노드—교집합—노드)", () => {
        const g = chainGraph(["A"], new Map([["B", 3]]), boxOf, countOf);
        expect(g.mids).toHaveLength(1);
        expect(g.mids[0]).toMatchObject({ id: "m:A+B", count: 3, traversed: false, prefix: ["A", "B"] });
        expect(g.links.map((l) => [l.from, l.to])).toEqual([["A", "m:A+B"], ["m:A+B", "B"]]);
    });

    it("교집합 노드는 두 노드 사이에 선다", () => {
        const g = chainGraph(["A"], new Map([["B", 3]]), boxOf, countOf);
        // A 중심(50,16) ↔ B 중심(450,16) 의 사이
        expect(g.mids[0]!.center.x).toBeGreaterThan(50);
        expect(g.mids[0]!.center.x).toBeLessThan(450);
        expect(g.mids[0]!.center.y).toBe(16);
    });

    // 기하가 재귀적이라는 게 이 설계의 핵심이다: 교집합 노드가 다음 걸음의 출발점이 된다.
    it("두 걸음: 지나온 교집합이 새 출발점이 되어 거기서 다시 뻗는다", () => {
        const g = chainGraph(["A", "B"], new Map([["C", 2]]), boxOf, countOf);
        const traversed = g.mids.filter((m) => m.traversed);
        const next = g.mids.filter((m) => !m.traversed);
        expect(traversed.map((m) => m.id)).toEqual(["m:A+B"]);
        expect(next.map((m) => m.id)).toEqual(["m:A+B+C"]);
        // 새 선은 **A 가 아니라 교집합 노드**에서 나간다
        expect(g.links.some((l) => l.from === "m:A+B" && l.to === "m:A+B+C")).toBe(true);
        expect(g.links.some((l) => l.from === "A" && l.to === "m:A+B+C")).toBe(false);
    });

    // 화살표가 "이 둘이 여기서 만난다"를 말해야지, 어디서 어디로 간다를 말하면 없는 방향을 지어낸다.
    it("지나온 걸음의 두 선은 **양 끝에서 교집합으로** 모인다", () => {
        const g = chainGraph(["A", "B"], new Map(), boxOf, countOf);
        const traversed = g.links.filter((l) => l.traversed);
        expect(traversed).toHaveLength(2);
        expect(traversed.every((l) => l.to === "m:A+B")).toBe(true);
        expect(traversed.map((l) => l.from).sort()).toEqual(["A", "B"]);
    });

    it("지나온 교집합의 수는 체인 접두사에서 나온다(주입)", () => {
        const g = chainGraph(["A", "B"], new Map(), boxOf, (p) => p.length * 10);
        expect(g.mids[0]).toMatchObject({ id: "m:A+B", count: 20, traversed: true });
    });

    it("id 는 체인 접두사 — 클릭 한 번으로 그 교집합까지의 체인을 복원할 수 있다", () => {
        const g = chainGraph(["A", "B"], new Map([["C", 1]]), boxOf, countOf);
        expect(g.mids.map((m) => m.id.slice(2).split("+"))).toEqual([["A", "B"], ["A", "B", "C"]]);
    });

    it("붙는 변은 상대 위치가 정한다 — 오른쪽 이웃이면 r→l", () => {
        const g = chainGraph(["A"], new Map([["B", 1]]), boxOf, countOf);
        expect(g.links[0]).toMatchObject({ from: "A", fromSide: "r", toSide: "l" });
    });

    it("상자를 못 찾는 짝은 조용히 버린다(막 내려간 그룹)", () => {
        const g = chainGraph(["A"], new Map([["없음", 3]]), boxOf, countOf);
        expect(g.mids).toEqual([]);
    });

    it("한 방향에 몰린 후보들의 교집합 노드는 서로 비켜선다", () => {
        const near: Record<string, { x: number; y: number; w: number; h: number }> = { ...boxes, D: { x: 400, y: 30, w: 100, h: 32 } };
        const g = chainGraph(["A"], new Map([["B", 1], ["D", 2]]), (id) => near[id], countOf);
        const [m1, m2] = g.mids;
        expect(Math.hypot(m1!.center.x - m2!.center.x, m1!.center.y - m2!.center.y)).toBeGreaterThan(40);
    });
});
