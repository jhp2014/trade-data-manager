import { describe, expect, it } from "vitest";
import type { ChartAnchor, GroupMembership } from "@trade-data-manager/wire";
import { buildPresenceIndex, hasActiveFilter, matchesPresence, matchesPresenceDnf, nextTriState, parsePresenceDnf, PRESENCE_KINDS, type DayPresence } from "../presence.js";

// 존재 지도 — 작업셋 모수·배지·필터의 단일 접기. 핵심 성질:
//  ① 재료 어느 한 쪽에만 흔적이 있어도 항목이 생긴다(골격만/그룹만/코멘트만 있는 날의 등재가 이번 개편의 목적).
//  ② 그룹은 하루 소속 ∪ 타점 소속 dedupe — "타점에만 붙인 그룹"도 그 날의 흔적이다.
//  ③ 필터는 3상 × AND — "골격 있음 ∧ 타점 없음" 같은 다음 작업 후보 질문이 성립해야 한다.

const anchor = (over: Partial<ChartAnchor>): ChartAnchor => ({
    stockCode: "005930", date: "2026-08-01", param: "baseline", anchorDate: "2026-07-30", field: "high", market: "un", ...over,
});
const membership = (over: Partial<GroupMembership> & Pick<GroupMembership, "groupNames">): GroupMembership => ({
    stockCode: "005930", date: "2026-08-01", ...over,
});

describe("buildPresenceIndex", () => {
    it("한 재료만 있어도 항목이 생긴다 — 골격만 찍은 날·그룹만 담은 날·코멘트만 남긴 날", () => {
        const idx = buildPresenceIndex(
            [anchor({ stockCode: "A", param: "skeleton" })],
            [],
            [membership({ stockCode: "B", groupNames: ["테마:2차전지"] })],
            [{ stockCode: "C", date: "2026-08-01" }],
        );
        expect(idx.get("A|2026-08-01")?.marks.get("skeleton")).toBe(1);
        expect(idx.get("B|2026-08-01")?.groups).toEqual(["테마:2차전지"]);
        expect(idx.get("C|2026-08-01")?.comment).toBe(true);
        expect(idx.size).toBe(3);
    });

    it("앵커는 param 별 개수로 접는다 — 같은 차트의 기준선 2 + 무시 1", () => {
        const idx = buildPresenceIndex(
            [anchor({}), anchor({ field: "low" }), anchor({ param: "ignore-candle", field: undefined, market: undefined })],
            [{ stockCode: "005930", date: "2026-08-01" }],
            [],
            [],
        );
        const d = idx.get("005930|2026-08-01");
        expect(d?.marks.get("baseline")).toBe(2);
        expect(d?.marks.get("ignore-candle")).toBe(1);
        expect(d?.points).toBe(1);
    });

    it("그룹은 하루 소속 ∪ 타점 소속 dedupe(이름순)", () => {
        const idx = buildPresenceIndex(
            [],
            [],
            [
                membership({ groupNames: ["나"] }), // 하루 소속(time 없음)
                membership({ time: "09:30:00", groupNames: ["가", "나"] }), // 타점 소속
            ],
            [],
        );
        expect(idx.get("005930|2026-08-01")?.groups).toEqual(["가", "나"]);
    });
});

describe("matchesPresence — 3상 × AND", () => {
    const day = (over: Partial<DayPresence>): DayPresence => ({
        stockCode: "005930", date: "2026-08-01", marks: new Map(), points: 0, groups: [], comment: false, ...over,
    });

    it("빈 필터는 전부 통과(기본값에 필터를 심지 않는다)", () => {
        expect(matchesPresence(day({}), {})).toBe(true);
        expect(hasActiveFilter({})).toBe(false);
    });

    it('"골격 있음 ∧ 타점 없음" — 다음 작업 후보 질문', () => {
        const f = { skeleton: "has", point: "not" } as const;
        expect(matchesPresence(day({ marks: new Map([["skeleton", 4]]) }), f)).toBe(true);
        expect(matchesPresence(day({ marks: new Map([["skeleton", 4]]), points: 1 }), f)).toBe(false);
        expect(matchesPresence(day({ points: 1 }), f)).toBe(false);
    });

    it("그룹·코멘트도 같은 술어를 탄다", () => {
        expect(matchesPresence(day({ groups: ["가"] }), { group: "has" })).toBe(true);
        expect(matchesPresence(day({}), { group: "has" })).toBe(false);
        expect(matchesPresence(day({ comment: true }), { comment: "not" })).toBe(false);
    });

    it("칩 순환은 any → has → not → any", () => {
        expect(nextTriState("any")).toBe("has");
        expect(nextTriState("has")).toBe("not");
        expect(nextTriState("not")).toBe("any");
    });
});

describe("matchesPresenceDnf — 절 사이 OR", () => {
    const day = (over: Partial<DayPresence>): DayPresence => ({
        stockCode: "005930", date: "2026-08-01", marks: new Map(), points: 0, groups: [], comment: false, ...over,
    });
    const skeletonOnly = day({ marks: new Map([["skeleton", 2]]) });
    const groupOnly = day({ groups: ["가"] });
    const pointOnly = day({ points: 1 });

    it('"골격∧!타점" ∨ "그룹" — 어느 절 하나만 맞아도 통과', () => {
        const dnf = [{ skeleton: "has", point: "not" }, { group: "has" }] as const;
        expect(matchesPresenceDnf(skeletonOnly, dnf)).toBe(true); // 첫 절
        expect(matchesPresenceDnf(groupOnly, dnf)).toBe(true); // 둘째 절
        expect(matchesPresenceDnf(pointOnly, dnf)).toBe(false); // 둘 다 아님
    });

    it("빈 절은 평가에서 제외 — OR 를 무력화하지 않는다", () => {
        const dnf = [{}, { skeleton: "has" }] as const;
        expect(matchesPresenceDnf(pointOnly, dnf)).toBe(false); // 빈 절이 있어도 활성 절이 거른다
        expect(matchesPresenceDnf(skeletonOnly, dnf)).toBe(true);
    });

    it("활성 절이 하나도 없으면 전부 통과(필터 없음)", () => {
        expect(matchesPresenceDnf(pointOnly, [])).toBe(true);
        expect(matchesPresenceDnf(pointOnly, [{}])).toBe(true);
    });
});

describe("parsePresenceDnf — 영속 복원(옛 형식 승계)", () => {
    it("옛 절-하나 Record 는 [절] 로 감싼다", () => {
        expect(parsePresenceDnf({ skeleton: "has", point: "not" })).toEqual([{ skeleton: "has", point: "not" }]);
        expect(parsePresenceDnf({})).toEqual([]); // 옛 빈 필터 = 필터 없음
    });
    it("새 절 목록은 그대로, 모르는 상태값은 버린다", () => {
        expect(parsePresenceDnf([{ skeleton: "has" }, { group: "not", weird: "yes" }])).toEqual([{ skeleton: "has" }, { group: "not" }]);
    });
    it("깨진 값은 null — 기본값(필터 없음)으로 폴백해 '전부 숨김' 오독을 막는다", () => {
        expect(parsePresenceDnf("oops")).toBeNull();
        expect(parsePresenceDnf(null)).toBeNull();
    });
});

describe("PRESENCE_KINDS", () => {
    it("앵커 4종(레지스트리 파생) + 타점·그룹·코멘트 = 7종", () => {
        expect(PRESENCE_KINDS.map((k) => k.key)).toEqual(["baseline", "ignore-candle", "skeleton", "skeleton-minute", "point", "group", "comment"]);
    });
});
