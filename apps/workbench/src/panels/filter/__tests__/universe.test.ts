import { describe, it, expect } from "vitest";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { committingUniverse, kindDeficiency, parseUniverse, predicateDeficiency, universeOfStages } from "../universe.js";
import type { FilterPredicate, PredicateKind } from "../stage.js";

// 2026-09-26 종단 폐기 — 우주 개념은 ①-4에서 모드째 은퇴한다. 이 파일은 그때까지의 과도기 규칙만 잠근다:
// 남은 종류는 전부 하루 가용이고, 종단은 결손이다(time·theme 는 종류 층 중립 — 이주 안전).

const KINDS: readonly PredicateKind[] = ["time", "cellValue", "priorHighBreak", "breakout", "candleShape", "theme"];

describe("kindDeficiency — 종류 × 우주", () => {
    it("하루에선 전부 가용", () => {
        for (const k of KINDS) expect(kindDeficiency(k, "daily"), k).toBeNull();
    });
    it("종단에선 time·theme 만 종류 층 중립, 나머지는 결손", () => {
        expect(kindDeficiency("time", "longitudinal")).toBeNull();
        expect(kindDeficiency("theme", "longitudinal")).toBeNull();
        for (const k of ["cellValue", "priorHighBreak", "breakout", "candleShape"] as const) {
            expect(kindDeficiency(k, "longitudinal"), k).not.toBeNull();
        }
    });
});

describe("predicateDeficiency — payload 까지 본다", () => {
    it("전이 수식어는 종단에서 결손이다(종단 행에는 '직전 분'이 없다)", () => {
        const p: FilterPredicate = { kind: "time", ranges: [{ from: "09:00", to: "10:30" }], transition: "firstOfDay" };
        expect(predicateDeficiency(p, "longitudinal").length).toBeGreaterThan(0);
        expect(predicateDeficiency(p, "daily")).toEqual([]);
    });
    it("theme 는 종류 층 중립 + payload 층 종단 결손(우주 파생이 안 뒤집힌다 — 이주 안전)", () => {
        expect(committingUniverse("theme")).toBeNull();
        const p: FilterPredicate = { kind: "theme", ...DEFAULT_THEME_ZONE };
        expect(predicateDeficiency(p, "longitudinal").length).toBeGreaterThan(0);
        expect(predicateDeficiency(p, "daily")).toEqual([]);
    });
});

describe("우주 파생", () => {
    it("한쪽에만 사는 종류가 우주를 정한다 — 중립(time·theme)은 안 정한다", () => {
        expect(committingUniverse("breakout")).toBe("daily");
        expect(committingUniverse("time")).toBeNull();
        expect(universeOfStages([{ predicates: [{ kind: "time" }] }])).toBeNull();
        expect(universeOfStages([{ predicates: [{ kind: "time" }, { kind: "breakout" }] }])).toBe("daily");
    });
});

describe("parseUniverse — 부재·오염은 종단(우주가 없던 시절의 행동 — 이주가 그 집합을 폐기한다)", () => {
    it("daily 만 daily", () => {
        expect(parseUniverse("daily")).toBe("daily");
        expect(parseUniverse(undefined)).toBe("longitudinal");
        expect(parseUniverse("쓰레기")).toBe("longitudinal");
    });
});
