import { describe, it, expect } from "vitest";
import type { Group, GroupMembership } from "../../../api/groups.js";
import { chainCandidates, mapArrows, membersOfAll, populationCounts, populationFeed, type PopulationItem } from "../mapView.js";

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

describe("mapArrows — 지나온 길과 갈 수 있는 곳", () => {
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {
        A: { x: 0, y: 0, w: 100, h: 34 },
        B: { x: 400, y: 0, w: 100, h: 34 },
        C: { x: 0, y: 300, w: 100, h: 34 },
    };
    const boxOf = (id: string) => boxes[id];

    it("체인이 비면 화살표도 없다", () => {
        expect(mapArrows([], new Map([["B", 3]]), boxOf).arrows).toEqual([]);
    });

    it("실선은 언제나 **체인의 마지막**에서 나간다 — 지금 서 있는 자리", () => {
        const { arrows } = mapArrows(["A", "C"], new Map([["B", 3]]), boxOf);
        const solid = arrows.filter((a) => a.kind === "candidate");
        expect(solid).toHaveLength(1);
        expect(solid[0]).toMatchObject({ from: "C", to: "B", count: 3 });
    });

    it("점선은 클릭 순서를 잇는다 — 수는 없다(지나온 자리라 물을 게 없다)", () => {
        const { arrows } = mapArrows(["A", "C"], new Map(), boxOf);
        const dotted = arrows.filter((a) => a.kind === "chain");
        expect(dotted).toHaveLength(1);
        expect(dotted[0]).toMatchObject({ from: "A", to: "C" });
        expect(dotted[0]!.count).toBeUndefined();
    });

    it("붙는 변은 상대 위치가 정한다 — 아래 이웃은 b→t, 오른쪽 이웃은 r→l", () => {
        const { arrows } = mapArrows(["A", "C"], new Map([["B", 1]]), boxOf);
        expect(arrows.find((a) => a.kind === "chain")).toMatchObject({ fromSide: "b", toSide: "t" });
        expect(arrows.find((a) => a.kind === "candidate")).toMatchObject({ fromSide: "r", toSide: "l" });
    });

    it("점은 실제로 쓰이는 변에만 — 가운데 노드는 들어온 변과 나가는 변 둘 다", () => {
        const { anchors } = mapArrows(["A", "C"], new Map([["B", 1]]), boxOf);
        expect(anchors.get("A")).toEqual(["b"]);
        expect(anchors.get("C")!.sort()).toEqual(["r", "t"]);
        expect(anchors.get("B")).toEqual(["l"]);
    });

    it("weight 는 후보들 사이의 상대값 — 최댓값이 1", () => {
        const { arrows } = mapArrows(["A"], new Map([["B", 8], ["C", 2]]), boxOf);
        expect(arrows.find((a) => a.to === "B")!.weight).toBe(1);
        expect(arrows.find((a) => a.to === "C")!.weight).toBe(0.25);
    });

    it("상자를 못 찾는 짝은 조용히 버린다(막 내려간 그룹)", () => {
        expect(mapArrows(["A"], new Map([["없음", 3]]), boxOf).arrows).toEqual([]);
    });
});
