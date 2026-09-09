import { describe, it, expect } from "vitest";
import type { GroupMembership } from "@trade-data-manager/wire";
import { applyGroupToggle, buildGroupIndex, countByGroup, foldPointIndexToDay, unionNames } from "../groupIndex.js";

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

    describe("좌표 라벨(타점 grain) — rowKey 일반화가 두 키 공간을 안 섞는다", () => {
        const P1 = { stockCode: "005930", date: "2026-06-30", time: "10:03:00" };

        it("인덱스 키 = 3조각 좌표 키 — 같은 (종목,날짜)의 2조각 차트 키와 충돌하지 않는다", () => {
            const idx = buildGroupIndex([{ ...P1, groupNames: ["눌림"] }]);
            expect(idx.get("005930|2026-06-30|10:03:00")).toEqual(["눌림"]);
            expect(idx.get("005930|2026-06-30")).toBeUndefined();
        });

        it("토글도 좌표 키로 맞춘다 — 같은 날 다른 시각은 별개 항목", () => {
            const f = [{ ...P1, groupNames: ["a"] }];
            const out = applyGroupToggle(f, { ...P1, time: "10:41:00" }, "a", true);
            expect(out).toHaveLength(2);
            expect(applyGroupToggle(f, P1, "a", true)).toBe(f); // 같은 좌표는 멱등(같은 배열)
        });
    });

    // (expandMemberships 는 유일 소비자였던 겹침 롤업이 그룹 목록 패널과 함께 폐기되며 삭제 — 2026-09-10.)
});

describe("foldPointIndexToDay — ∃ 상향의 색인(좌표 라벨 피드 → 하루)", () => {
    it("같은 날의 라벨들을 차트 키 하나로 합친다(중복 이름 dedupe)", () => {
        const m = foldPointIndexToDay([
            { stockCode: "005930", date: "2026-06-30", time: "10:03:00", groupNames: ["눌림", "돌파"] },
            { stockCode: "005930", date: "2026-06-30", time: "13:10:00", groupNames: ["눌림"] },
            { stockCode: "000660", date: "2026-06-30", time: "09:10:00", groupNames: ["갭"] },
        ]);
        expect(m.get("005930|2026-06-30")).toEqual(["눌림", "돌파"]);
        expect(m.get("000660|2026-06-30")).toEqual(["갭"]);
    });

    it("라벨 없는 날은 키가 없다 — 조회 쪽이 빈 배열 고정 참조로 받는다", () => {
        expect(foldPointIndexToDay([]).size).toBe(0);
    });
});

describe("unionNames — 깔때기 groupNamesOf 의 3갈래 결합", () => {
    it("point 쪽이 비면 day 참조 그대로(라벨 없는 날 대다수 — 추가 할당 0)", () => {
        const day = ["테마", "소재"];
        expect(unionNames(day, [])).toBe(day);
    });

    it("day 쪽이 비면 point 참조 그대로", () => {
        const pt = ["눌림"];
        expect(unionNames([], pt)).toBe(pt);
    });

    it("겹치는 이름은 한 번만(중복 dedupe)", () => {
        expect(unionNames(["테마", "눌림"], ["눌림", "갭"])).toEqual(["테마", "눌림", "갭"]);
    });

    it("둘 다 비면 빈 배열", () => {
        expect(unionNames([], [])).toEqual([]);
    });
});
