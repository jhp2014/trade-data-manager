import { describe, it, expect } from "vitest";
import type { GroupMembership } from "@trade-data-manager/wire";
import type { Group } from "@trade-data-manager/wire";
import { applyGroupToggle, buildGroupIndex, buildChartGroupIndex, countByGroup, expandMemberships } from "../groupIndex.js";

const P1 = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const P2 = { stockCode: "005930", date: "2026-06-30", time: "10:00:00" };
const DAY1 = { stockCode: "005930", date: "2026-06-30" };
const nameOf = (id: string): string => id; // 정렬 기준은 이름 — 테스트에선 id 가 곧 이름

const feed = (...xs: GroupMembership[]): GroupMembership[] => xs;

describe("groupIndex", () => {
    describe("한 피드에서 두 층위를 접는다", () => {
        const f = feed({ ...P1, groupIds: ["a", "b"] }, { ...DAY1, groupIds: ["c"] });

        it("타점 인덱스는 시각 있는 것만", () => {
            const idx = buildGroupIndex(f);
            expect(idx.size).toBe(1);
            expect(idx.get("005930|2026-06-30|09:11:00")).toEqual(["a", "b"]);
        });

        it("차트 인덱스는 시각 없는 것만", () => {
            const idx = buildChartGroupIndex(f);
            expect(idx.size).toBe(1);
            expect(idx.get("005930|2026-06-30")).toEqual(["c"]);
        });

        it("건수는 두 층위 합산", () => {
            expect(countByGroup(f)).toEqual(new Map([["a", 1], ["b", 1], ["c", 1]]));
        });
    });

    describe("applyGroupToggle — 하루·타점을 한 함수가 다룬다", () => {
        it("타점에 넣기(이름순 삽입)", () => {
            const out = applyGroupToggle(feed({ ...P1, groupIds: ["b"] }), P1, "a", true, nameOf);
            expect(out[0]!.groupIds).toEqual(["a", "b"]);
        });

        it("하루에 넣기 — 같은 종목·날짜의 타점 항목과 섞이지 않는다", () => {
            const out = applyGroupToggle(feed({ ...P1, groupIds: ["a"] }), DAY1, "c", true, nameOf);
            expect(out).toHaveLength(2);
            expect(out.find((m) => m.time === undefined)?.groupIds).toEqual(["c"]);
            expect(out.find((m) => m.time === P1.time)?.groupIds).toEqual(["a"]);
        });

        it("빼면 항목이 비고, 비면 항목째 사라진다", () => {
            const out = applyGroupToggle(feed({ ...P1, groupIds: ["a"] }), P1, "a", false, nameOf);
            expect(out).toEqual([]);
        });

        it("바뀔 게 없으면 **같은 배열**을 그대로 — 이걸 deps 로 쓰는 useMemo 가 헛돌지 않게", () => {
            const f = feed({ ...P1, groupIds: ["a"] });
            expect(applyGroupToggle(f, P1, "a", true, nameOf)).toBe(f); // 이미 있음
            expect(applyGroupToggle(f, P2, "z", false, nameOf)).toBe(f); // 없는 걸 빼기
        });

        it("없던 항목에 넣으면 새 항목이 생긴다", () => {
            const out = applyGroupToggle([], P1, "a", true, nameOf);
            expect(out).toEqual([{ ...P1, groupIds: ["a"] }]);
        });
    });

    describe("expandMemberships — 계층 상속을 조회용 사본에 편다", () => {
        const grp = (id: string, parentId: string | null = null): Group =>
            ({ id, name: id, scope: "day", parentId, mapId: null, x: null, y: null });
        // 테마 ▸ {2차전지, 반도체}
        const byId = new Map<string, Group>([["테마", grp("테마")], ["2차전지", grp("2차전지", "테마")], ["반도체", grp("반도체", "테마")]]);

        it("자식 소속이면 조상도 적용된다", () => {
            const out = expandMemberships(feed({ ...DAY1, groupIds: ["2차전지"] }), byId);
            expect(out[0]!.groupIds).toEqual(["2차전지", "테마"]);
        });

        it("같은 부모의 자식 둘에 들어 있어도 부모는 한 번 — countByGroup 을 얹으면 dedupe 롤업", () => {
            const out = expandMemberships(feed({ ...DAY1, groupIds: ["2차전지", "반도체"] }), byId);
            expect(out[0]!.groupIds).toEqual(["2차전지", "반도체", "테마"]);
            expect(countByGroup(out).get("테마")).toBe(1);
        });

        it("바뀔 게 없는 항목은 같은 참조 그대로", () => {
            const f = feed({ ...DAY1, groupIds: ["테마"] });
            expect(expandMemberships(f, byId)[0]).toBe(f[0]);
        });
    });
});
