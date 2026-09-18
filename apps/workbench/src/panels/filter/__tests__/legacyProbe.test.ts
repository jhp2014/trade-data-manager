import { describe, it, expect, beforeEach } from "vitest";
import { SEED_IDS, DEFAULT_SEED_KNOBS } from "@trade-data-manager/market/domain";
import { conditionsFromLegacyBag, knobsFromLegacy, migrateProbeStages } from "../legacyProbe.js";

// 옛 "탐색 후보" 패널의 panelUi 는 **무검증 JSON 가방**이다 — 여기가 뚫리면 깨진 blob 이 평가기까지 간다.
// 그리고 이주는 **한 번**이어야 한다: 매번 심으면 "우주 전환 = 조건 비우기" 규칙이 거짓말이 된다.

// 도장(1회 판정)만 localStorage 를 쓴다 — 그 한 줄 때문에 jsdom 을 켜지 않는다(설정 머리 주석: 이름이 곧 선언).
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
};

beforeEach(() => store.clear());

const bagOf = (bag: Record<string, unknown>) => ({ probe: bag });

describe("옛 노브 번역", () => {
    it("조건 묶음이 없으면 **옛 스칼라로 만든 시드** — 조정값이 조용히 기본값으로 안 돌아간다", () => {
        const conds = conditionsFromLegacyBag({ surgeAmountEok: 200, priorHighDays: 5, zoneOn: true });
        const surge = conds.find((c) => c.id === SEED_IDS.surge)!;
        expect(surge.predicates).toContainEqual({ kind: "cellValue", field: "cumAmountEok", ranges: [{ from: { kind: "value", value: 200 } }] });
        expect(conds.find((c) => c.id === SEED_IDS.priorHigh)!.predicates).toContainEqual({ kind: "priorHighBreak", days: 5 });
        expect(conds.find((c) => c.id === SEED_IDS.zone)!.enabled).toBe(true);
    });

    it("모양이 틀린 옛 값은 기본값으로 떨군다(문자열이 숫자 칸에 앉아도 터지지 않는다)", () => {
        const k = knobsFromLegacy({ surgeRatePct: "다섯", gridOn: 1, zoneMaxRank: 7 });
        expect(k.surgeRatePct).toBe(DEFAULT_SEED_KNOBS.surgeRatePct);
        expect(k.gridOn).toBe(DEFAULT_SEED_KNOBS.gridOn);
        expect(k.zoneMaxRank).toBe(7);
    });

    it("성한 저장물은 그대로 — 사용자의 편집이 시드에 먹히지 않는다", () => {
        const saved = [{ id: "mine", name: "내 조건", enabled: true, predicates: [{ kind: "gridPoint" }] }];
        expect(conditionsFromLegacyBag({ cellConditions: saved })).toEqual(saved);
    });

    it("깨진 blob(배열이 아님)은 시드로 폴백한다", () => {
        expect(conditionsFromLegacyBag({ cellConditions: { nope: 1 }, surgeRatePct: 9 })).toHaveLength(4);
    });
});

describe("1회 이주", () => {
    it("옛 가방이 있으면 칸으로 선다 — 술어 어휘가 합류해 필드가 그대로 맞는다", () => {
        const stages = migrateProbeStages(bagOf({ cellConditions: [{ id: "mine", enabled: true, predicates: [{ kind: "gridPoint" }], transition: "firstOfDay" }] }))!;
        expect(stages).toEqual([{ id: "mine", enabled: true, predicates: [{ kind: "gridPoint" }], transition: "firstOfDay" }]);
    });

    it("두 번째부터는 null — 사용자가 지운 칸이 전환할 때마다 되살아나면 안 된다", () => {
        const bag = bagOf({ surgeAmountEok: 200 });
        expect(migrateProbeStages(bag)).not.toBeNull();
        expect(migrateProbeStages(bag)).toBeNull();
    });

    it("옛 가방이 없으면 null이고 **도장도 안 찍는다** — 나중에 열어본 가방이 이주 기회를 잃으면 안 된다", () => {
        expect(migrateProbeStages({})).toBeNull();
        expect(migrateProbeStages({ "rank-sheet": { cols: 3 } })).toBeNull();
        expect(migrateProbeStages(bagOf({ surgeAmountEok: 200 }))).not.toBeNull();
    });

    it("빈 조건 묶음은 이주할 게 없다(빈 벌과 같다) — 그래도 도장은 찍혀 다음에 안 본다", () => {
        expect(migrateProbeStages(bagOf({ cellConditions: [] }))).toBeNull();
        expect(migrateProbeStages(bagOf({ surgeAmountEok: 200 }))).toBeNull();
    });
});
