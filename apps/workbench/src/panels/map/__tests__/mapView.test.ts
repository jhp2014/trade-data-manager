import { describe, it, expect } from "vitest";
import type { Group, GroupMembership } from "../../../api/groups.js";
import { bridgeArrows, overlaps, populationCounts, populationFeed, populationMembersOf, type PopulationItem } from "../mapView.js";

const grp = (id: string, parentId: string | null = null): Group =>
    ({ id, name: id, scope: "day", parentId, mapId: "m", x: 0, y: 0 });

// 테마 ▸ 2차전지 · 갭상승(무관)
const byId = new Map<string, Group>([["테마", grp("테마")], ["2차전지", grp("2차전지", "테마")], ["갭상승", grp("갭상승")]]);

const item = (code: string, groups: string[]): { it: PopulationItem; ids: string[] } =>
    ({ it: { stockCode: code, date: "2026-07-01" }, ids: groups });

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

describe("populationCounts — 노드 숫자", () => {
    it("적용 집합 기준이라 자식 소속이 부모에도 센다", () => {
        const feed: GroupMembership[] = [
            { stockCode: "A", date: "d", groupIds: ["2차전지", "테마"] },
            { stockCode: "B", date: "d", groupIds: ["테마"] },
        ];
        const c = populationCounts(feed);
        expect(c.get("테마")).toBe(2);
        expect(c.get("2차전지")).toBe(1);
    });
});

describe("populationMembersOf — 짚은 그룹의 목록", () => {
    it("그 그룹이 적용되는 항목만", () => {
        const feed: GroupMembership[] = [
            { stockCode: "A", date: "d", groupIds: ["테마"] },
            { stockCode: "B", date: "d", groupIds: ["갭상승"] },
        ];
        expect(populationMembersOf(feed, "테마").map((m) => m.stockCode)).toEqual(["A"]);
    });
});

describe("overlaps — 징검다리", () => {
    const feed: GroupMembership[] = [
        { stockCode: "A", date: "d", groupIds: ["2차전지", "테마", "갭상승"] },
        { stockCode: "B", date: "d", groupIds: ["테마", "갭상승"] },
    ];

    it("겹친 항목 수를 쌍으로 센다", () => {
        const out = overlaps(feed, { only: "갭상승" });
        const pair = out.find((o) => o.aId === "갭상승" || o.bId === "갭상승");
        expect(out).toHaveLength(2); // 갭상승-테마(2), 갭상승-2차전지(1)
        expect(pair).toBeTruthy();
    });

    it("groupById 를 주면 조상–자손 쌍이 빠진다 — 포함관계는 징검다리가 아니다", () => {
        const out = overlaps(feed, { groupById: byId });
        expect(out.some((o) => (o.aId === "테마" && o.bId === "2차전지") || (o.aId === "2차전지" && o.bId === "테마"))).toBe(false);
        // 무관한 쌍은 남는다.
        expect(out.some((o) => [o.aId, o.bId].includes("갭상승"))).toBe(true);
    });

    it("within 밖 그룹은 쌍에 안 낀다(평면에 없는 그룹)", () => {
        const out = overlaps(feed, { within: new Set(["테마", "갭상승"]) });
        expect(out).toHaveLength(1);
        expect(out[0]!.count).toBe(2);
    });
});

describe("bridgeArrows — 방향은 데이터가 아니라 시선이다", () => {
    // A(왼쪽) · B(오른쪽) · C(아래)
    const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {
        A: { x: 0, y: 0, w: 100, h: 34 },
        B: { x: 400, y: 0, w: 100, h: 34 },
        C: { x: 0, y: 300, w: 100, h: 34 },
    };
    const boxOf = (id: string) => boxes[id];
    // overlaps 는 id 정렬 순이라 짚은 쪽이 a 일 수도 b 일 수도 있다.
    const ovs = [{ aId: "A", bId: "B", count: 2 }, { aId: "A", bId: "C", count: 8 }];

    it("짚은 게 없으면 화살표도 없다 — 전부 그리면 실뭉치가 된다", () => {
        expect(bridgeArrows(ovs, null, boxOf).arrows).toEqual([]);
    });

    it("출발은 언제나 짚은 그룹 — 쌍의 정렬 순서와 무관하다", () => {
        const { arrows } = bridgeArrows(ovs, "C", boxOf);
        expect(arrows).toHaveLength(1); // A-B 쌍은 C 가 안 껴서 버려진다
        expect(arrows[0]).toMatchObject({ from: "C", to: "A" });
    });

    it("짚은 그룹이 안 낀 쌍은 버린다 — 두면 이웃→이웃 화살표가 생긴다", () => {
        expect(bridgeArrows([{ aId: "A", bId: "B", count: 5 }], "C", boxOf).arrows).toEqual([]);
    });

    it("다른 그룹을 짚으면 통째로 뒤집힌다(대칭인 사실에 방향을 새기지 않는다)", () => {
        expect(bridgeArrows(ovs, "A", boxOf).arrows.find((a) => a.to === "C")).toMatchObject({ from: "A", to: "C" });
        expect(bridgeArrows(ovs, "C", boxOf).arrows[0]).toMatchObject({ from: "C", to: "A" });
    });

    it("붙는 변은 상대 위치가 정한다 — 오른쪽 이웃은 r→l, 아래 이웃은 b→t", () => {
        const { arrows } = bridgeArrows(ovs, "A", boxOf);
        expect(arrows.find((a) => a.to === "B")).toMatchObject({ fromSide: "r", toSide: "l" });
        expect(arrows.find((a) => a.to === "C")).toMatchObject({ fromSide: "b", toSide: "t" });
    });

    it("점은 실제로 쓰이는 변에만 — 출발 노드는 두 방향으로 나간다", () => {
        const { anchors } = bridgeArrows(ovs, "A", boxOf);
        expect(anchors.get("A")!.sort()).toEqual(["b", "r"]);
        expect(anchors.get("B")).toEqual(["l"]);
        expect(anchors.get("C")).toEqual(["t"]);
    });

    it("weight 는 이 선택 안의 상대값 — 최댓값이 1", () => {
        const { arrows } = bridgeArrows(ovs, "A", boxOf);
        expect(arrows.find((a) => a.to === "C")!.weight).toBe(1);
        expect(arrows.find((a) => a.to === "B")!.weight).toBe(0.25);
    });

    it("상자를 못 찾는 쌍은 조용히 버린다(막 내려간 그룹)", () => {
        const { arrows } = bridgeArrows([{ aId: "A", bId: "없음", count: 3 }], "A", boxOf);
        expect(arrows).toEqual([]);
    });
});
