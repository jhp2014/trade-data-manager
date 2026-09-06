// parsePointDef — 관대한 병합(필드 단위 폴백)이 계약이다: 슬라이스 영속·SavedSet payload 가 같은 파서를 본다.
import { describe, expect, it } from "vitest";
import { DEFAULT_POINT_DEFINITION } from "@trade-data-manager/market/domain";
import { isDefaultPointDef, parsePointDef, parseTradeSimParams } from "../pointDef.js";

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

    it("시뮬 노브 — 옛 저장물(sim 없음)은 통째 기본값, 오염은 그 필드만 기본", () => {
        expect(parsePointDef({})!.sim).toEqual(DEFAULT_POINT_DEFINITION.sim);
        const p = parsePointDef({ sim: { stopPct: 4, takePct: "x" } })!;
        expect(p.sim).toEqual({ ...DEFAULT_POINT_DEFINITION.sim, stopPct: 4 });
    });

    it("시뮬 진입 pct — 0(즉시)은 보존, 0<pct<2 는 2로 **올림**(0으로 내리면 정반대 뜻)", () => {
        expect(parseTradeSimParams({ entry: { anchor: "close", pct: 0 } }).entry.pct).toBe(0);
        expect(parseTradeSimParams({ entry: { anchor: "close", pct: 1 } }).entry.pct).toBe(2);
        expect(parseTradeSimParams({ entry: { anchor: "close", pct: 7 } }).entry.pct).toBe(7);
    });

    it("시뮬 취소 노브 — null/누락/오염/0 이하는 전부 off(켜진 척하지 않는다), 분은 정수", () => {
        const off = parseTradeSimParams({ cancelRisePct: "x", cancelAfterMin: 0 });
        expect(off.cancelRisePct).toBeNull();
        expect(off.cancelAfterMin).toBeNull();
        const on = parseTradeSimParams({ cancelRisePct: 1, cancelAfterMin: 30.6 });
        expect(on.cancelRisePct).toBe(2); // 하한 2 클램프
        expect(on.cancelAfterMin).toBe(31);
    });

    it("isDefaultPointDef — sim 딥 비교(참조 비교면 파서가 새 객체를 만들어 배지가 영영 안 뜬다)", () => {
        expect(isDefaultPointDef(parsePointDef({ sim: { ...DEFAULT_POINT_DEFINITION.sim } })!)).toBe(true);
        expect(isDefaultPointDef(parsePointDef({ sim: { stopPct: 9 } })!)).toBe(false);
    });
});
