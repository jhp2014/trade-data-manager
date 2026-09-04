// parsePointDef — 관대한 병합(필드 단위 폴백)이 계약이다: 슬라이스 영속·SavedSet payload 가 같은 파서를 본다.
import { describe, expect, it } from "vitest";
import { DEFAULT_POINT_DEFINITION } from "@trade-data-manager/market/domain";
import { isDefaultPointDef, parsePointDef } from "../pointDef.js";

describe("parsePointDef", () => {
    it("객체가 아니면 null(호출자가 기본값으로)", () => {
        expect(parsePointDef(null)).toBeNull();
        expect(parsePointDef("x")).toBeNull();
        expect(parsePointDef(7)).toBeNull();
    });

    it("필드 누락·오염·음수·비유한은 그 필드만 기본값 — 통째 폐기하지 않는다", () => {
        const p = parsePointDef({ baselineGateEok: 70, renewalGateEok: -1, excludeUptoMin: "545", mergeRisePct: Infinity });
        expect(p).toEqual({ ...DEFAULT_POINT_DEFINITION, baselineGateEok: 70 });
    });

    it("빈 객체 = 전부 기본값(옛 저장물 호환)", () => {
        expect(parsePointDef({})).toEqual(DEFAULT_POINT_DEFINITION);
        expect(isDefaultPointDef(parsePointDef({})!)).toBe(true);
    });

    it("bullOnly — 옛 저장물(필드 없음)은 true, boolean 아닌 오염은 기본값, false 는 보존", () => {
        expect(parsePointDef({})!.bullOnly).toBe(true);
        expect(parsePointDef({ bullOnly: 1 })!.bullOnly).toBe(true);
        expect(parsePointDef({ bullOnly: false })!.bullOnly).toBe(false);
    });

    it("허용 폭 T — 옛 저장물(필드 없음·lens 시절)은 기본 2/5, 오염은 그 필드만 기본", () => {
        expect(parsePointDef({})!.toleranceT1Pct).toBe(2);
        expect(parsePointDef({})!.toleranceT2Pct).toBe(5);
        expect(parsePointDef({ lens: "high" })).toEqual(DEFAULT_POINT_DEFINITION); // 렌즈 필드는 무시(관대 병합)
        expect(parsePointDef({ toleranceT2Pct: "x" })!.toleranceT2Pct).toBe(5);
    });

    it("허용 폭 T — 도메인 [2,30] 클램프, 역전(t1 > t2)은 정규화", () => {
        expect(parsePointDef({ toleranceT1Pct: 0.5, toleranceT2Pct: 99 })).toMatchObject({ toleranceT1Pct: 2, toleranceT2Pct: 30 });
        expect(parsePointDef({ toleranceT1Pct: 8, toleranceT2Pct: 3 })).toMatchObject({ toleranceT1Pct: 3, toleranceT2Pct: 8 });
        expect(isDefaultPointDef(parsePointDef({ toleranceT2Pct: 8 })!)).toBe(false);
    });
});
