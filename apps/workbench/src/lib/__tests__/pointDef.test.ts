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
});
