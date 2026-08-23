import { describe, expect, it } from "vitest";
import type { ChartAnchor, GroupMembership } from "@trade-data-manager/wire";
import {
    addKind, buildPresenceIndex, candidateDaysOf, hasActiveFilter, matchesPresence, matchesPresenceDnf,
    parsePresenceDnf, PRESENCE_KINDS, removeClause, removeKind, toggleKind,
    type DayPresence, type PresenceDnf,
} from "../presence.js";

// 존재 지도 — 작업셋 모수·배지·필터의 단일 접기. 핵심 성질:
//  ① 재료 어느 한 쪽에만 흔적이 있어도 항목이 생긴다(골격만/그룹만/코멘트만 있는 날의 등재가 이번 개편의 목적).
//  ② 그룹은 층위별로 갈라 담는다(하루 소속 / 타점 소속) — 둘 다 그 날의 흔적이지만 다른 작업이다.
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
            [anchor({ stockCode: "A", param: "baseline" })],
            [],
            [membership({ stockCode: "B", groupNames: ["테마:2차전지"] })],
            [{ stockCode: "C", date: "2026-08-01" }],
        );
        expect(idx.get("A|2026-08-01")?.marks.get("baseline")).toBe(1);
        expect(idx.get("B|2026-08-01")?.dayGroups).toEqual(["테마:2차전지"]);
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

    it("그룹은 **층위별로** 나눠 담는다 — 하루 소속과 타점 소속은 다른 작업이라 한 칸에 섞지 않는다", () => {
        const idx = buildPresenceIndex(
            [],
            [],
            [
                membership({ groupNames: ["나"] }), // 하루 소속(time 없음)
                membership({ time: "09:30:00", groupNames: ["가", "나"] }), // 타점 소속
            ],
            [],
        );
        const d = idx.get("005930|2026-08-01");
        expect(d?.dayGroups).toEqual(["나"]);
        expect(d?.pointGroups).toEqual(["가", "나"]);
    });
});

describe("candidateDaysOf — 후보 하루(분석 모수) 파생", () => {
    it("편집물(앵커∪타점∪그룹) 있는 날만 — 코멘트만 남긴 날은 제외(기록≠판단, 옛 서버 union 정의)", () => {
        const idx = buildPresenceIndex(
            [anchor({ stockCode: "A" })],
            [{ stockCode: "B", date: "2026-08-01" }],
            [membership({ stockCode: "C", groupNames: ["테마"] })],
            [{ stockCode: "D", date: "2026-08-01" }], // 코멘트만 — 후보 아님
        );
        expect(candidateDaysOf(idx).map((c) => c.stockCode)).toEqual(["A", "B", "C"]);
    });

    it("정렬 — 날짜 내림차순 → 종목 오름차순(옛 서버 정렬 계승, 화면마다 안 흔들리게)", () => {
        const idx = buildPresenceIndex(
            [anchor({ stockCode: "B", date: "2026-08-01" }), anchor({ stockCode: "A", date: "2026-08-01" }), anchor({ stockCode: "C", date: "2026-08-02" })],
            [], [], [],
        );
        expect(candidateDaysOf(idx).map((c) => `${c.stockCode}|${c.date}`)).toEqual([
            "C|2026-08-02", "A|2026-08-01", "B|2026-08-01",
        ]);
    });
});

describe("matchesPresence — 3상 × AND", () => {
    const day = (over: Partial<DayPresence>): DayPresence => ({
        stockCode: "005930", date: "2026-08-01", marks: new Map(), points: 0, dayGroups: [], pointGroups: [], comment: false, ...over,
    });

    it("빈 필터는 전부 통과(기본값에 필터를 심지 않는다)", () => {
        expect(matchesPresence(day({}), {})).toBe(true);
        expect(hasActiveFilter({})).toBe(false);
    });

    it('"골격 있음 ∧ 타점 없음" — 다음 작업 후보 질문', () => {
        const f = { baseline: "has", point: "not" } as const;
        expect(matchesPresence(day({ marks: new Map([["baseline", 4]]) }), f)).toBe(true);
        expect(matchesPresence(day({ marks: new Map([["baseline", 4]]), points: 1 }), f)).toBe(false);
        expect(matchesPresence(day({ points: 1 }), f)).toBe(false);
    });

    it("그룹·코멘트도 같은 술어를 탄다", () => {
        expect(matchesPresence(day({ dayGroups: ["가"] }), { "group-day": "has" })).toBe(true);
        expect(matchesPresence(day({}), { "group-day": "has" })).toBe(false);
        expect(matchesPresence(day({ comment: true }), { comment: "not" })).toBe(false);
    });

    it("⚠ 그룹 두 종류는 서로를 안 본다 — 일봉에서 하루 그룹을 배정한 날도 '타점 그룹 없음'으로 잡힌다", () => {
        // 이 성질이 없으면 분봉 작업 대상 고르기가 통째로 무너진다(필터 깔때기의 층위 있는 '없음'과 같은 이유).
        const 하루만 = day({ dayGroups: ["테마A"] });
        expect(matchesPresence(하루만, { "group-point": "not" })).toBe(true);
        expect(matchesPresence(하루만, { "group-day": "not" })).toBe(false);
        expect(matchesPresence(day({ pointGroups: ["눌림"] }), { "group-point": "not" })).toBe(false);
    });

});

// 칩 손짓 → 식. 좌클릭은 반전만 하고 삭제는 우클릭 메뉴가 진다(WorksetFilterRow) — 그래서
// "반전하려다 칩이 사라지는" 일이 없고, 대신 **빈 절이 남지 않는 책임**이 지우기 쪽에 생긴다.
describe("DNF 편집 연산", () => {
    it("칩 좌클릭 = has ↔ not 만 오간다(제거로 넘어가지 않는다)", () => {
        const dnf: PresenceDnf = [{ baseline: "has" }];
        const notted = toggleKind(dnf, 0, "baseline");
        expect(notted).toEqual([{ baseline: "not" }]);
        expect(toggleKind(notted, 0, "baseline")).toEqual([{ baseline: "has" }]);
    });

    it("종류 추가는 늘 has 로 들어오고 다른 절은 안 건드린다", () => {
        const dnf: PresenceDnf = [{ baseline: "has" }, { group: "not" }];
        expect(addKind(dnf, 0, "point")).toEqual([{ baseline: "has", point: "has" }, { group: "not" }]);
    });

    it("칩 지우기 — 절에 다른 칩이 남으면 절은 산다", () => {
        const dnf: PresenceDnf = [{ baseline: "has", point: "not" }];
        expect(removeKind(dnf, 0, "point")).toEqual([{ baseline: "has" }]);
    });

    it("마지막 칩을 지우면 절도 함께 사라진다 — 빈 절(유령 토큰)을 만들지 않는다", () => {
        const dnf: PresenceDnf = [{ baseline: "has" }, { "group-day": "has" }];
        expect(removeKind(dnf, 0, "baseline")).toEqual([{ "group-day": "has" }]);
        expect(removeKind([{ baseline: "has" }], 0, "baseline")).toEqual([]);
    });

    it("절 통째 지우기", () => {
        const dnf: PresenceDnf = [{ baseline: "has" }, { "group-day": "has" }];
        expect(removeClause(dnf, 1)).toEqual([{ baseline: "has" }]);
    });

    it("모든 연산이 원본을 안 건드린다(식은 props 로만 흐른다)", () => {
        const dnf: PresenceDnf = [{ baseline: "has", point: "not" }];
        toggleKind(dnf, 0, "baseline"); addKind(dnf, 0, "group-day"); removeKind(dnf, 0, "point"); removeClause(dnf, 0);
        expect(dnf).toEqual([{ baseline: "has", point: "not" }]);
    });
});

describe("matchesPresenceDnf — 절 사이 OR", () => {
    const day = (over: Partial<DayPresence>): DayPresence => ({
        stockCode: "005930", date: "2026-08-01", marks: new Map(), points: 0, dayGroups: [], pointGroups: [], comment: false, ...over,
    });
    const baselineOnly = day({ marks: new Map([["baseline", 2]]) });
    const groupOnly = day({ dayGroups: ["가"] });
    const pointOnly = day({ points: 1 });

    it('"골격∧!타점" ∨ "그룹" — 어느 절 하나만 맞아도 통과', () => {
        const dnf = [{ baseline: "has", point: "not" }, { "group-day": "has" }] as const;
        expect(matchesPresenceDnf(baselineOnly, dnf)).toBe(true); // 첫 절
        expect(matchesPresenceDnf(groupOnly, dnf)).toBe(true); // 둘째 절
        expect(matchesPresenceDnf(pointOnly, dnf)).toBe(false); // 둘 다 아님
    });

    it("빈 절은 평가에서 제외 — OR 를 무력화하지 않는다", () => {
        const dnf = [{}, { baseline: "has" }] as const;
        expect(matchesPresenceDnf(pointOnly, dnf)).toBe(false); // 빈 절이 있어도 활성 절이 거른다
        expect(matchesPresenceDnf(baselineOnly, dnf)).toBe(true);
    });

    it("활성 절이 하나도 없으면 전부 통과(필터 없음)", () => {
        expect(matchesPresenceDnf(pointOnly, [])).toBe(true);
        expect(matchesPresenceDnf(pointOnly, [{}])).toBe(true);
    });
});

describe("parsePresenceDnf — 영속 복원(옛 형식 승계)", () => {
    it("옛 절-하나 Record 는 [절] 로 감싼다", () => {
        expect(parsePresenceDnf({ baseline: "has", point: "not" })).toEqual([{ baseline: "has", point: "not" }]);
        expect(parsePresenceDnf({})).toEqual([]); // 옛 빈 필터 = 필터 없음
    });
    it("새 절 목록은 그대로, 모르는 상태값은 버린다", () => {
        expect(parsePresenceDnf([{ baseline: "has" }, { point: "not", weird: "yes" }])).toEqual([{ baseline: "has" }, { point: "not" }]);
    });
    it("모르는 **종류**도 버린다 — 층위 없던 옛 'group' 칩은 화면에도 안 서는 유령이라 여기서 정리된다", () => {
        expect(parsePresenceDnf([{ baseline: "has", group: "has" }])).toEqual([{ baseline: "has" }]);
        expect(parsePresenceDnf([{ group: "has" }])).toEqual([]); // 그것뿐이었으면 절째 사라진다
    });
    it("빈 절은 버린다 — 옛 순환(has→not→제거)이 남긴 유령 토큰이 화면에 서지 않게", () => {
        expect(parsePresenceDnf([{}, { baseline: "has" }])).toEqual([{ baseline: "has" }]);
        expect(parsePresenceDnf([{ weird: "yes" }])).toEqual([]); // 아는 상태값이 하나도 없으면 그것도 빈 절
    });
    it("깨진 값은 null — 기본값(필터 없음)으로 폴백해 '전부 숨김' 오독을 막는다", () => {
        expect(parsePresenceDnf("oops")).toBeNull();
        expect(parsePresenceDnf(null)).toBeNull();
    });
});

describe("PRESENCE_KINDS", () => {
    it("앵커 2종(레지스트리 파생) + 타점·그룹 둘·코멘트 = 6종 — 골격 2종은 은퇴", () => {
        expect(PRESENCE_KINDS.map((k) => k.key)).toEqual(["baseline", "ignore-candle", "point", "group-day", "group-point", "comment"]);
    });

    it("이름을 가진 종류는 그룹 둘뿐 — 배지의 색 카드가 이걸 보고 선다", () => {
        expect(PRESENCE_KINDS.filter((k) => k.namesOf).map((k) => k.key)).toEqual(["group-day", "group-point"]);
    });
});
