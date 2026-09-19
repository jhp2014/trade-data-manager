import { describe, it, expect } from "vitest";
import { canPin, dayStagesOf, dayUnsupportedReason, parsePanelBinding, targetUniverseOf } from "../panelSetBinding.js";
import type { SavedSet } from "../../../store/savedSetsSlice.js";
import type { FilterStage } from "../stage.js";

// panelUi 는 무검증 JSON 가방이다 — 핀을 읽는 자리가 문지기고, **깨진 참조는 연동으로 폴백하지 않는다**
// (조용한 폴백 = 다른 집합을 보여주는 실패).

const stage = (id: string): FilterStage => ({ id, enabled: true, predicates: [] });
const set = (id: string, universe: SavedSet["universe"], stages: FilterStage[] = []): SavedSet =>
    ({ id, name: id, stages, universe });

describe("parsePanelBinding — 저장물 문지기", () => {
    it("영속 3종이 통과한다", () => {
        expect(parsePanelBinding({ kind: "saved", setId: "fs1" })).toEqual({ kind: "saved", setId: "fs1" });
        expect(parsePanelBinding({ kind: "survivors" })).toEqual({ kind: "survivors" });
        expect(parsePanelBinding({ kind: "universe" })).toEqual({ kind: "universe" });
    });

    it("세션 참조(항목 목록)는 핀이 될 수 없다 — 정의가 세션 밖에 없다", () => {
        expect(parsePanelBinding({ kind: "items", label: "밴드", items: [] })).toBeNull();
        expect(canPin(null)).toBe(false);
        expect(canPin({ kind: "saved", setId: "fs1" })).toBe(true);
    });

    it("없거나 깨진 값은 연동(null)", () => {
        expect(parsePanelBinding(undefined)).toBeNull();
        expect(parsePanelBinding("saved")).toBeNull();
        expect(parsePanelBinding({ kind: "saved" })).toBeNull();
    });

    it("**지워진 집합을 가리켜도 그대로 둔다** — 깨진 참조는 화면이 받는다(자동 폴백 금지)", () => {
        expect(parsePanelBinding({ kind: "saved", setId: "없는것" })).toEqual({ kind: "saved", setId: "없는것" });
    });
});

describe("targetUniverseOf — 이 바인딩은 어느 우주로 풀리나", () => {
    const sets = [set("fs-long", "longitudinal"), set("fs-day", "daily")];
    it("저장 집합은 자기 우주를 들고 다닌다", () => {
        expect(targetUniverseOf({ kind: "saved", setId: "fs-day" }, sets, "longitudinal")).toBe("daily");
        expect(targetUniverseOf({ kind: "saved", setId: "fs-long" }, sets, "daily")).toBe("longitudinal");
    });

    it("연동·전체·최종 생존은 **작업 깔때기의 우주**다", () => {
        expect(targetUniverseOf(null, sets, "daily")).toBe("daily");
        expect(targetUniverseOf({ kind: "survivors" }, sets, "daily")).toBe("daily");
        expect(targetUniverseOf({ kind: "universe" }, sets, "longitudinal")).toBe("longitudinal");
    });

    it("지워진 집합은 작업 우주로 읽는다 — 그 다음 판정(못 푸는 이유)이 사실을 말한다", () => {
        expect(targetUniverseOf({ kind: "saved", setId: "없는것" }, sets, "daily")).toBe("daily");
    });
});

describe("dayStagesOf / dayUnsupportedReason — 하루 우주에서 무엇을 평가하나", () => {
    const working = [stage("w1")];
    const sets = [set("fs-day", "daily", [stage("s1")])];

    it("연동·최종 생존은 작업 깔때기의 조건, 저장 집합은 그 집합의 조건", () => {
        expect(dayStagesOf(null, sets, working)).toEqual(working);
        // 최종 생존 = "작업 깔때기가 지금 내는 것" — 하루 우주에선 곧 작업 조건의 평가다.
        expect(dayStagesOf({ kind: "survivors" }, sets, working)).toEqual(working);
        expect(dayStagesOf({ kind: "saved", setId: "fs-day" }, sets, working)).toEqual([stage("s1")]);
    });

    it("풀 수 없는 바인딩은 null 이고 **이유가 따라온다**(조용한 빈 화면 금지)", () => {
        expect(dayStagesOf({ kind: "orphan", label: "옛 조립 바인딩" }, sets, working)).toBeNull();
        expect(dayStagesOf({ kind: "universe" }, sets, working)).toBeNull();
        expect(dayUnsupportedReason({ kind: "universe" }, sets)).toMatch(/조건이 있어야/);
        expect(dayUnsupportedReason({ kind: "saved", setId: "없는것" }, sets)).toBe("(지워진 집합)");
    });

    it("풀 수 있으면 이유가 없다", () => {
        expect(dayUnsupportedReason(null, sets)).toBeNull();
        expect(dayUnsupportedReason({ kind: "saved", setId: "fs-day" }, sets)).toBeNull();
    });
});
