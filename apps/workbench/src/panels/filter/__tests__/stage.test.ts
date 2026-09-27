import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { describe, it, expect } from "vitest";
import {
    activeStages, isPredicateEmpty, parseStages, stageKind, takeRetiredPredicateCount,
    type FilterPredicate, type FilterStage,
} from "../stage.js";

// 2026-09-26 종단 폐기 — 옛 종단 kind(그룹·축·날짜·결과·급타점)와 격자 Point 의 규칙 테스트는
// 그 kind 와 함께 은퇴했다. 이 파일은 남은 종류(시각·셀·돌파·캔들·테마)의 모양과 **이주**를 잠근다.

const timePred: FilterPredicate = { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] };
const stage = (id: string, predicates: FilterPredicate[], enabled = true): FilterStage => ({ id, enabled, predicates });

describe("isPredicateEmpty — 빈 조건은 평가에서 빠져야 한다", () => {
    it("빈 배열·전부 꺼진 테마 컷은 비었다", () => {
        expect(isPredicateEmpty({ kind: "time", ranges: [] })).toBe(true);
        expect(isPredicateEmpty({ kind: "cellValue", field: "cumAmountEok", ranges: [{}] })).toBe(true);
        expect(isPredicateEmpty({ kind: "candle", axes: {} })).toBe(true);
        expect(isPredicateEmpty({ kind: "candle", axes: { rate: { on: true, from: 5 } } })).toBe(false);
    });

    it("한쪽 경계만 있어도 조건이다(반열림)", () => {
        expect(isPredicateEmpty({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: 5 } }] })).toBe(false);
    });
});

describe("activeStages — 켜져 있고 빈 술어가 아닌 게 있어야 센다", () => {
    it("꺼진 단계·빈 술어뿐인 단계는 빠진다", () => {
        const on = stage("a", [timePred]);
        const off = stage("b", [timePred], false);
        const empty = stage("c", [{ kind: "time", ranges: [] }]);
        expect(activeStages([on, off, empty])).toEqual([on]);
        expect(stageKind(empty)).toBe("time");
    });
});

describe("parseStages — 반쯤 살아난 조건은 없느니만 못하다", () => {
    it("정상 저장본을 읽는다 — 술어의 옛 전이는 벗긴다(전이 은퇴 2026-09-27)", () => {
        const raw = [{ id: "a", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }], transition: "firstOfDay" }] }];
        expect(parseStages(raw)).toEqual([
            { id: "a", name: undefined, enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }] },
        ]);
    });

    it("칸 전이 「처음으로/직전 대비 상승」은 칸의 테마 술어 enter 로 잇는다 — 테마가 없으면 벗긴다", () => {
        const theme = { kind: "theme", ...DEFAULT_THEME_ZONE };
        const migrated = parseStages([{ id: "a", enabled: true, transition: "firstTrue", predicates: [theme] }])!;
        expect(migrated[0]!.predicates[0]).toMatchObject({ kind: "theme", enter: true });
        expect("transition" in migrated[0]!).toBe(false);
        const stripped = parseStages([{ id: "b", enabled: true, transition: "improve", predicates: [{ kind: "time", ranges: [] }] }])!;
        expect("transition" in stripped[0]!).toBe(false);
    });

    it("enabled 가 없으면 켜진 것으로 본다(옛 저장본 관용)", () => {
        expect(parseStages([{ id: "a", predicates: [] }])![0]!.enabled).toBe(true);
    });

    it("배열이 아니거나 모르는 술어 종류면 통째로 버린다", () => {
        expect(parseStages({})).toBeNull();
        expect(parseStages([{ id: "a", predicates: [{ kind: "옛것" }] }])).toBeNull();
        expect(parseStages([{ enabled: true, predicates: [] }])).toBeNull();
    });

    it("시간 구간의 속이 깨졌으면 버린다 — 양끝 필수 문자열", () => {
        expect(parseStages([{ id: "a", predicates: [{ kind: "time", ranges: [{ from: 9, to: 10 }] }] }])).toBeNull();
    });
});

describe("라벨 술어 — core 파서 한 벌을 그대로 쓴다", () => {
    it("왕복한다 · 그룹을 안 고른 라벨은 빈 술어다", () => {
        const raw = [{ id: "l", enabled: true, predicates: [{ kind: "label", scope: "day", groups: ["후발주", "순위 급등"] }] }];
        expect(parseStages(raw)![0]!.predicates[0]).toEqual({ kind: "label", scope: "day", groups: ["후발주", "순위 급등"] });
        expect(isPredicateEmpty({ kind: "label", scope: "point", groups: [] })).toBe(true);
    });
});

describe("은퇴 kind 이주(2026-09-26 종단 폐기) — 저장본 통째 폐기가 아니라 **그 칸만** 걷는다", () => {
    it("전고 돌파(2026-09-27 은퇴)가 든 칸도 칸째 걷힌다", () => {
        takeRetiredPredicateCount();
        const raw = [
            { id: "p", enabled: true, predicates: [{ kind: "priorHighBreak", days: 20 }] },
            { id: "t", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }] },
        ];
        expect(parseStages(raw)!.map((s) => s.id)).toEqual(["t"]);
        expect(takeRetiredPredicateCount()).toBe(1);
    });

    it("은퇴 술어가 든 칸은 AND 형제가 있어도 **칸째** 걷힌다 — 느슨해진 AND 를 남기지 않는다(2026-09-27 리뷰)", () => {
        takeRetiredPredicateCount();
        const raw = [{
            id: "a", enabled: true,
            predicates: [
                { kind: "date", ranges: [{ from: "2026-07-01", to: "2026-07-31" }] },
                { kind: "time", ranges: [{ from: "09:00", to: "10:30" }] },
            ],
        }, {
            id: "b", enabled: true,
            predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }],
        }];
        expect(parseStages(raw)).toEqual([{ id: "b", name: undefined, enabled: true, predicates: [timePred] }]);
        expect(takeRetiredPredicateCount()).toBe(1);
    });

    it("은퇴 술어뿐이던 칸은 칸째 걷힌다 — parseExpr 가 그 잎을 떨군다", () => {
        takeRetiredPredicateCount();
        const raw = [
            { id: "g", enabled: true, predicates: [{ kind: "group", expr: { groups: [] }, scope: "day" }] },
            { id: "t", enabled: true, predicates: [{ kind: "time", ranges: [{ from: "09:00", to: "10:30" }] }] },
        ];
        const got = parseStages(raw)!;
        expect(got.map((s) => s.id)).toEqual(["t"]);
        expect(takeRetiredPredicateCount()).toBe(1);
    });

    it("은퇴 kind 전부가 걷힌다 — 하나라도 null 로 새면 사용자 집합이 전멸한다", () => {
        takeRetiredPredicateCount();
        const kinds = ["group", "axisBand", "axisValue", "date", "outcome", "outcomeRecovery", "hotPoints", "gridPoint"];
        const raw = [{ id: "a", enabled: true, predicates: kinds.map((kind) => ({ kind })) }];
        expect(parseStages(raw)).toEqual([]);
        expect(takeRetiredPredicateCount()).toBe(kinds.length);
    });
});

describe("themeStrength → theme 이주 골든(2026-09-26 — 종류 은퇴)", () => {
    const params = { zoneRateN: 12, zoneAmountN: 34, zoneAmountWindow: 60 as const, basis: "amount" as const, countOn: true, countMin: 5, baseRankOn: false, baseRankMax: 3, zoneRankOn: true, zoneRankMax: 2 };

    it("옛 저장물이 theme 로 사상돼 읽힌다 — 폐기 0(파라미터 사상 정확)", () => {
        const raw = [{ id: "t1", enabled: true, predicates: [{ kind: "themeStrength", params }] }];
        const back = parseStages(raw)!;
        const p = back[0]!.predicates[0] as Extract<FilterPredicate, { kind: "theme" }>;
        expect(p).toMatchObject({
            kind: "theme", window: 60, zoneAmountN: 34, rate: { mode: "rank", max: 12 },
            basis: "amount", countOn: true, countMin: 5, zoneRankOn: true, zoneRankMax: 2,
        });
    });

    it("깨진 params 는 조건-off theme — 저장본 전체를 폐기하지 않는다", () => {
        const back = parseStages([{ id: "t1", enabled: true, predicates: [{ kind: "themeStrength", params: "x" }] }])!;
        const p = back[0]!.predicates[0] as Extract<FilterPredicate, { kind: "theme" }>;
        expect(p.kind).toBe("theme");
        expect(isPredicateEmpty(p)).toBe(true);
    });
});

describe("theme 술어 — 저장 왕복·빈 판정(2026-09-26)", () => {
    it("payload 그대로 왕복한다", () => {
        const p = {
            kind: "theme", window: 30, zoneAmountN: 40, rate: { mode: "rank", max: 30 }, basis: "rate",
            countOn: true, countMin: 3, baseRankOn: false, baseRankMax: 3, zoneRankOn: true, zoneRankMax: 2,
        };
        const back = parseStages([{ id: "t", enabled: true, predicates: [p] }])!;
        expect(back[0]!.predicates[0]).toMatchObject(p);
    });
});

describe("돌파 생성기·캔들 모양 — 저장물 왕복(savedSets 영속)", () => {
    it("돌파(사슬 필터 식 포함)가 그대로 왕복한다", () => {
        const p = {
            kind: "breakout", zigzagPct: 3, bandPct: 1,
            chain: { expr: { id: "chain", of: [{ kind: "check", id: "a", cond: { kind: "amount", minEok: 50 }, firstK: 1 }], ops: [], groups: [] }, firstK: null },
        };
        const back = parseStages([{ id: "b", enabled: true, predicates: [p] }])!;
        expect(back[0]!.predicates[0]).toMatchObject(p);
    });

    it("캔들 모양이 왕복한다", () => {
        const back = parseStages([{ id: "c", enabled: true, predicates: [{ kind: "candleShape", shape: "bear" }] }])!;
        // 옛 양봉/음봉 → 캔들 시가→종가 축 이주(2026-09-27).
        expect(back[0]!.predicates[0]).toEqual({ kind: "candle", axes: { openClose: { on: true, to: -0.01 } } });
    });
});
