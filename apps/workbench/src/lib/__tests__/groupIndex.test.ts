import { describe, it, expect } from "vitest";
import type { GroupMembership } from "@trade-data-manager/wire";
import type { Group } from "@trade-data-manager/wire";
import { applyGroupToggle, buildGroupIndex, countByGroup, expandMemberships } from "../groupIndex.js";

const DAY1 = { stockCode: "005930", date: "2026-06-30" };
const DAY2 = { stockCode: "000660", date: "2026-06-30" };

const feed = (...xs: GroupMembership[]): GroupMembership[] => xs;

describe("groupIndex", () => {
    describe("피드를 차트키로 접는다", () => {
        const f = feed({ ...DAY1, groupNames: ["a", "b"] }, { ...DAY2, groupNames: ["c"] });

        it("인덱스 키 = 차트키", () => {
            const idx = buildGroupIndex(f);
            expect(idx.size).toBe(2);
            expect(idx.get("005930|2026-06-30")).toEqual(["a", "b"]);
            expect(idx.get("000660|2026-06-30")).toEqual(["c"]);
        });

        it("건수는 항목 전부를 센다", () => {
            expect(countByGroup(f)).toEqual(new Map([["a", 1], ["b", 1], ["c", 1]]));
        });
    });

    describe("applyGroupToggle", () => {
        it("넣기(이름순 삽입)", () => {
            const out = applyGroupToggle(feed({ ...DAY1, groupNames: ["b"] }), DAY1, "a", true);
            expect(out[0]!.groupNames).toEqual(["a", "b"]);
        });

        it("다른 차트는 안 건드린다", () => {
            const out = applyGroupToggle(feed({ ...DAY1, groupNames: ["a"] }), DAY2, "c", true);
            expect(out).toHaveLength(2);
            expect(out.find((m) => m.stockCode === DAY2.stockCode)?.groupNames).toEqual(["c"]);
            expect(out.find((m) => m.stockCode === DAY1.stockCode)?.groupNames).toEqual(["a"]);
        });

        it("빼면 항목이 비고, 비면 항목째 사라진다", () => {
            const out = applyGroupToggle(feed({ ...DAY1, groupNames: ["a"] }), DAY1, "a", false);
            expect(out).toEqual([]);
        });

        it("바뀔 게 없으면 **같은 배열**을 그대로 — 이걸 deps 로 쓰는 useMemo 가 헛돌지 않게", () => {
            const f = feed({ ...DAY1, groupNames: ["a"] });
            expect(applyGroupToggle(f, DAY1, "a", true)).toBe(f); // 이미 있음
            expect(applyGroupToggle(f, DAY2, "z", false)).toBe(f); // 없는 걸 빼기
        });

        it("없던 항목에 넣으면 새 항목이 생긴다", () => {
            const out = applyGroupToggle([], DAY1, "a", true);
            expect(out).toEqual([{ ...DAY1, groupNames: ["a"] }]);
        });
    });

    describe("expandMemberships — 계층 상속을 조회용 사본에 편다", () => {
        const grp = (name: string, parentName: string | null = null): Group => ({ name, parentName });
        // 테마 ▸ {2차전지, 반도체}
        const byName = new Map<string, Group>([["테마", grp("테마")], ["2차전지", grp("2차전지", "테마")], ["반도체", grp("반도체", "테마")]]);

        it("자식 소속이면 조상도 적용된다", () => {
            const out = expandMemberships(feed({ ...DAY1, groupNames: ["2차전지"] }), byName);
            expect(out[0]!.groupNames).toEqual(["2차전지", "테마"]);
        });

        it("같은 부모의 자식 둘에 들어 있어도 부모는 한 번 — countByGroup 을 얹으면 dedupe 롤업", () => {
            const out = expandMemberships(feed({ ...DAY1, groupNames: ["2차전지", "반도체"] }), byName);
            expect(out[0]!.groupNames).toEqual(["2차전지", "반도체", "테마"]);
            expect(countByGroup(out).get("테마")).toBe(1);
        });

        it("바뀔 게 없는 항목은 같은 참조 그대로", () => {
            const f = feed({ ...DAY1, groupNames: ["테마"] });
            expect(expandMemberships(f, byName)[0]).toBe(f[0]);
        });
    });
});
