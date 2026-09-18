import { describe, it, expect } from "vitest";
import { SEED_IDS, DEFAULT_SEED_KNOBS } from "@trade-data-manager/market/domain";
import { CELL_CONDITIONS_KEY, knobsFromLegacy, readCellConditions, withFloor } from "../conditions.js";

// panelUi 는 무검증 JSON 가방이다 — 여기가 뚫리면 깨진 blob 이 평가기까지 간다(conditions.ts 머리 주석).

/** 꼬리 자리의 "누적대금 ≥ N" 값(없으면 null) — 하한 항의 정체는 값이 아니라 **자리**다(withFloor 주석). */
const floorOf = (c: { predicates: unknown[] }): number | null => {
    const p = c.predicates[c.predicates.length - 1] as { kind: string; field?: string; ranges?: { from?: { kind: string; value: number } }[] } | undefined;
    if (p?.kind === "cellValue" && p.field === "cumAmountEok" && p.ranges?.[0]?.from?.kind === "value") return p.ranges[0].from!.value;
    return null;
};

describe("옛 노브 1회 번역", () => {
    it("조건 키가 비어 있으면 **옛 스칼라로 만든 시드**가 선다 — 조정값이 조용히 기본값으로 안 돌아간다", () => {
        const conds = readCellConditions({ surgeAmountEok: 200, priorHighDays: 5, zoneOn: true, minCumAmountEok: 30 });
        const surge = conds.find((c) => c.id === SEED_IDS.surge)!;
        const prior = conds.find((c) => c.id === SEED_IDS.priorHigh)!;
        expect(surge.predicates).toContainEqual({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: 200 } }] });
        expect(prior.predicates).toContainEqual({ kind: "priorHighBreak", days: 5 });
        expect(conds.find((c) => c.id === SEED_IDS.zone)!.enabled).toBe(true);
        // 하한은 **모든 칸**에 항으로 복제된다(칸 밖 전역 게이트를 만들지 않는다).
        for (const c of conds) expect(floorOf(c), c.id).toBe(30);
    });

    it("옛 키가 없으면 기본 시드 — 하한 0 이면 항을 아예 안 넣는다", () => {
        const conds = readCellConditions(undefined);
        expect(conds.map((c) => c.id)).toEqual([SEED_IDS.grid, SEED_IDS.surge, SEED_IDS.priorHigh, SEED_IDS.zone]);
        expect(floorOf(conds[0])).toBeNull();
        expect(conds.find((c) => c.id === SEED_IDS.zone)!.enabled).toBe(DEFAULT_SEED_KNOBS.zoneOn);
    });

    it("모양이 틀린 옛 값은 기본값으로 떨군다(문자열이 숫자 칸에 앉아도 터지지 않는다)", () => {
        const k = knobsFromLegacy({ surgeRatePct: "다섯", gridOn: 1, zoneMaxRank: 7 });
        expect(k.surgeRatePct).toBe(DEFAULT_SEED_KNOBS.surgeRatePct);
        expect(k.gridOn).toBe(DEFAULT_SEED_KNOBS.gridOn);
        expect(k.zoneMaxRank).toBe(7);
    });
});

describe("저장된 조건 읽기", () => {
    it("성한 저장물은 그대로 — 사용자의 편집이 시드에 먹히지 않는다", () => {
        const saved = [{ id: "mine", name: "내 조건", enabled: true, predicates: [{ kind: "gridPoint" }] }];
        expect(readCellConditions({ [CELL_CONDITIONS_KEY]: saved })).toEqual(saved);
    });

    it("빈 배열은 유효한 상태다 — '조건 없음 = 안 보여줌'이지 시드 복귀가 아니다", () => {
        expect(readCellConditions({ [CELL_CONDITIONS_KEY]: [] })).toEqual([]);
    });

    it("깨진 blob(배열이 아님)은 시드로 폴백한다", () => {
        expect(readCellConditions({ [CELL_CONDITIONS_KEY]: { nope: 1 }, surgeRatePct: 9 })).toHaveLength(4);
        const conds = readCellConditions({ [CELL_CONDITIONS_KEY]: "[]", surgeRatePct: 9 });
        expect(conds.find((c) => c.id === SEED_IDS.surge)!.predicates).toContainEqual({
            kind: "cellValue",
            field: "ratePct",
            ranges: [{ from: { kind: "value", value: 9 } }],
        });
    });
});

describe("하한 일괄 손잡이(withFloor)", () => {
    it("모든 칸의 꼬리에 항을 넣고, 0 이면 걷는다", () => {
        const seeded = readCellConditions(undefined);
        const with30 = withFloor(seeded, 0, 30);
        for (const c of with30) expect(floorOf(c), c.id).toBe(30);
        // 되돌리면 시드와 **글자까지 같다**(꼬리 항만 정확히 걷혔다는 증거 — 값으로 세면 급등대금 칸의
        // 자기 임계가 꼬리에 남아 floorOf 가 그걸 읽으므로, 여기선 왕복 동일성이 진짜 자다).
        expect(withFloor(with30, 30, 0)).toEqual(seeded);
    });

    it("⚠ 같은 값의 **자기 임계**는 안 지운다 — 하한 100 과 급등대금 100 이 겹쳐도 살아남는다", () => {
        const seeded = readCellConditions({ surgeAmountEok: 100 });
        const with100 = withFloor(seeded, 0, 100);
        const surge = with100.find((c) => c.id === SEED_IDS.surge)!;
        expect(surge.predicates.filter((p) => p.kind === "cellValue" && p.field === "cumAmountEok")).toHaveLength(2);
        const cleared = withFloor(with100, 100, 0);
        expect(cleared.find((c) => c.id === SEED_IDS.surge)!.predicates).toEqual(seeded.find((c) => c.id === SEED_IDS.surge)!.predicates);
    });
});
