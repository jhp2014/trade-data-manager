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

    it("자격 시각 — 옛 저장물 두 세대(스칼라·창 하나)를 목록으로 승계, 새 채널이 이긴다", () => {
        expect(parsePointDef({})!.qualifyWindows).toEqual([]); // 빈 목록 = 전부 통과
        expect(parsePointDef({ excludeUptoMin: 545 })!.qualifyWindows).toEqual([{ from: 546, to: 1200 }]); // "545 이하 제외" = "546 부터"
        expect(parsePointDef({ excludeUptoMin: 0 })!.qualifyWindows).toEqual([]); // 옛 기본값 = 세션 전부 → 접힌다
        expect(parsePointDef({ qualifyFromMin: 840, qualifyToMin: 1200 })!.qualifyWindows).toEqual([{ from: 840, to: 1200 }]); // 반나절짜리 중간 형태
        expect(parsePointDef({ excludeUptoMin: 545, qualifyFromMin: 600 })!.qualifyWindows).toEqual([{ from: 600, to: 1200 }]);
        expect(parsePointDef({ qualifyWindows: [{ from: 600, to: 700 }], qualifyFromMin: 900 })!.qualifyWindows).toEqual([{ from: 600, to: 700 }]);
        // 배열이 아닌 오염은 "그 채널이 없는 것" — 관대 병합이라 다음 채널로 내려간다
        expect(parsePointDef({ qualifyWindows: "garbage", excludeUptoMin: 545 })!.qualifyWindows).toEqual([{ from: 546, to: 1200 }]);
        // 옛 스칼라가 세션 끝 이상(= 전량 제외)이면 합집합으로 표현할 수 없어 끝 1분만 자격으로 읽는다
        expect(parsePointDef({ excludeUptoMin: 9999 })!.qualifyWindows).toEqual([{ from: 1200, to: 1200 }]);
    });

    it("자격 시각 — 클램프·정수 분·역전 정리·정렬·겹침(맞닿음) 병합·세션 전부는 접힌다", () => {
        expect(parsePointDef({ qualifyWindows: [{ from: 0, to: 9999 }] })!.qualifyWindows).toEqual([]); // 전부 덮으면 = 조건 없음
        expect(parsePointDef({ qualifyWindows: [{ from: 600.7, to: 660.2 }] })!.qualifyWindows).toEqual([{ from: 601, to: 660 }]);
        expect(parsePointDef({ qualifyWindows: [{ from: 900, to: 700 }] })!.qualifyWindows).toEqual([{ from: 700, to: 900 }]);
        expect(parsePointDef({ qualifyWindows: [{ from: 800, to: 900 }, { from: 540, to: 600 }] })!.qualifyWindows).toEqual([
            { from: 540, to: 600 },
            { from: 800, to: 900 },
        ]);
        // 분이 정수라 [540,600] 과 [601,660] 은 같은 뜻 — 맞닿은 구간도 합친다
        expect(parsePointDef({ qualifyWindows: [{ from: 540, to: 600 }, { from: 601, to: 660 }] })!.qualifyWindows).toEqual([{ from: 540, to: 660 }]);
        expect(parsePointDef({ qualifyWindows: [{ from: 540, to: 620 }, { from: 600, to: 660 }] })!.qualifyWindows).toEqual([{ from: 540, to: 660 }]);
        expect(parsePointDef({ qualifyWindows: "garbage" })!.qualifyWindows).toEqual([]);
        // 한쪽만 결손이면 그 방향을 세션 끝으로 채운다(중간 형태 채널과 같은 취급), 통째 오염 항목만 버린다
        expect(parsePointDef({ qualifyWindows: [{ from: 600, to: null }, 7] })!.qualifyWindows).toEqual([{ from: 600, to: 1200 }]);
        // 세션 밖 구간은 클램프가 아니라 **버린다** — 08:00~08:00 같은 퇴화 창을 만들지 않는다
        expect(parsePointDef({ qualifyWindows: [{ from: 300, to: 420 }] })!.qualifyWindows).toEqual([]);
        expect(parsePointDef({ qualifyWindows: [{ from: 1260, to: 1320 }] })!.qualifyWindows).toEqual([]);
        expect(parsePointDef({ qualifyWindows: [{ from: 400, to: 600 }] })!.qualifyWindows).toEqual([{ from: 480, to: 600 }]); // 걸치면 잘라 쓴다
        expect(isDefaultPointDef(parsePointDef({ qualifyWindows: [{ from: 600, to: 700 }] })!)).toBe(false);
    });

    it("허용 폭 T 는 정의가 아니다(2026-09-09 인스턴스화) — 옛 T 필드는 조용히 무시된다", () => {
        expect(parsePointDef({ lens: "high" })).toEqual(DEFAULT_POINT_DEFINITION); // 렌즈 필드는 무시(관대 병합)
        expect(parsePointDef({ toleranceT1Pct: 8, toleranceT2Pct: 9 })).toEqual(DEFAULT_POINT_DEFINITION);
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
