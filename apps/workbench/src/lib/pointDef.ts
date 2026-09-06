// 타점 정의 파서 — 영속 슬라이스(wb.pointDef.v1)와 SavedSet payload 가 **같은 유효성 정의**를 본다
// (themeStrength 의 parseThemeStrengthParams 선례 — 갈리면 저장 집합이 남의 값으로 평가된다).
// 관대한 병합: 필드 누락·오염은 그 필드만 기본값 — null 반환으로 통째 폐기하지 않는다(옛 저장물 호환).
import {
    APPROACH_MAX_PCT,
    APPROACH_MIN_PCT,
    DEFAULT_POINT_DEFINITION,
    DEFAULT_TRADE_SIM_PARAMS,
    SIM_PCT_MAX,
    SIM_PCT_MIN,
    TOLERANCE_MAX_PCT,
    TOLERANCE_MIN_PCT,
    type PointDefinition,
    type TradeSimParams,
} from "@trade-data-manager/market/domain";

/**
 * 시뮬 노브 7 파서 — 같은 관대 병합(필드 단위 폴백) + 클램프 단일 출처. 시뮬 패널 입력칸의
 * normalize 도 이 함수를 지나야 한다(정규화 규칙 두 벌 금지 — simulate 는 재정규화하지 않는다).
 * 진입 pct: **0 = 즉시 체결 특례 허용, 0<pct<2 는 2로 올림**(0으로 내리면 "즉시"라는 정반대 뜻이 된다),
 * 그 밖 % 는 [2, 50] 클램프. 취소 둘은 null = off(오염도 off — 켜진 척하지 않는다), 시간은 정수 분.
 */
export function parseTradeSimParams(raw: unknown): TradeSimParams {
    const D = DEFAULT_TRADE_SIM_PARAMS;
    if (!raw || typeof raw !== "object") return D;
    const r = raw as Partial<Record<keyof TradeSimParams, unknown>>;
    const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    const pct = (v: unknown, d: number): number => Math.min(SIM_PCT_MAX, Math.max(SIM_PCT_MIN, num(v, d)));
    const entryRaw = r.entry && typeof r.entry === "object" ? (r.entry as { pct?: unknown }) : null;
    const entryPct = num(entryRaw?.pct, D.entry.pct);
    const offOr = (v: unknown, min: number, max?: number): number | null => {
        if (v === null || v === undefined) return null;
        const x = num(v, Number.NaN);
        if (Number.isNaN(x) || x <= 0) return null;
        return Math.min(max ?? Infinity, Math.max(min, x));
    };
    const cancelAfter = offOr(r.cancelAfterMin, 1);
    return {
        entry: { anchor: "close", pct: entryPct === 0 ? 0 : Math.min(SIM_PCT_MAX, Math.max(SIM_PCT_MIN, entryPct)) },
        stopPct: pct(r.stopPct, D.stopPct),
        takePct: pct(r.takePct, D.takePct),
        trailUpPct: pct(r.trailUpPct, D.trailUpPct),
        trailDownPct: pct(r.trailDownPct, D.trailDownPct),
        cancelRisePct: offOr(r.cancelRisePct, SIM_PCT_MIN, SIM_PCT_MAX),
        cancelAfterMin: cancelAfter === null ? null : Math.round(cancelAfter),
    };
}

export function parsePointDef(raw: unknown): PointDefinition | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Partial<Record<keyof PointDefinition, unknown>>;
    const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d); // num 재사용 금지 — ≥0 가드가 boolean 을 조용히 먹는다
    // 허용 폭 T — 도메인 [2,30] 클램프, 역전(t1 > t2)은 정규화. 옛 저장물(lens 필드 시절)은 기본 2/5 로 채워진다.
    const tol = (v: unknown, d: number): number =>
        Math.min(TOLERANCE_MAX_PCT, Math.max(TOLERANCE_MIN_PCT, num(v, d)));
    const t1raw = tol(r.toleranceT1Pct, DEFAULT_POINT_DEFINITION.toleranceT1Pct);
    const t2raw = tol(r.toleranceT2Pct, DEFAULT_POINT_DEFINITION.toleranceT2Pct);
    return {
        // 게이트는 **정수 억**으로 정규화 — pointsOf 의 `BigInt(gateEok)` 가 소수를 받으면 던진다
        // (RangeError). setPointDef 가 매번 이 파서를 지나므로 여기 한 곳이 전 입력 경로(타이핑·
        // 스트립 칸 클릭·SavedSet payload·영속 복원)의 유일한 가드다.
        baselineGateEok: Math.round(num(r.baselineGateEok, DEFAULT_POINT_DEFINITION.baselineGateEok)),
        renewalGateEok: Math.round(num(r.renewalGateEok, DEFAULT_POINT_DEFINITION.renewalGateEok)),
        excludeUptoMin: num(r.excludeUptoMin, DEFAULT_POINT_DEFINITION.excludeUptoMin),
        mergeRisePct: num(r.mergeRisePct, DEFAULT_POINT_DEFINITION.mergeRisePct),
        bullOnly: bool(r.bullOnly, DEFAULT_POINT_DEFINITION.bullOnly), // 2026-08-31 추가 — 옛 저장물엔 없어 기본 true 로 채워진다
        // 2026-09-05 추가(격자 v9 기준 밴드) — 옛 저장물엔 없어 기본 0.5, 도메인 [0, 0.5] 클램프(상한 = 굽는 하한).
        approachPct: Math.min(APPROACH_MAX_PCT, Math.max(APPROACH_MIN_PCT, num(r.approachPct, DEFAULT_POINT_DEFINITION.approachPct))),
        toleranceT1Pct: Math.min(t1raw, t2raw),
        toleranceT2Pct: Math.max(t1raw, t2raw),
        sim: parseTradeSimParams(r.sim), // 2026-09-06 추가 — 옛 저장물엔 없어 통째 기본값으로 채워진다
    };
}

/** 시뮬 노브 동일성 — entry 가 중첩 객체라 참조 비교로는 항상 다르다(isDefaultPointDef 딥 비교의 이유). */
export function sameTradeSimParams(a: TradeSimParams, b: TradeSimParams): boolean {
    return (
        a.entry.anchor === b.entry.anchor &&
        a.entry.pct === b.entry.pct &&
        a.stopPct === b.stopPct &&
        a.takePct === b.takePct &&
        a.trailUpPct === b.trailUpPct &&
        a.trailDownPct === b.trailDownPct &&
        a.cancelRisePct === b.cancelRisePct &&
        a.cancelAfterMin === b.cancelAfterMin
    );
}

/** 기본값과 동일한가 — 머리 UI 의 "기본값" 배지·되돌리기 노출 판정. sim 은 중첩 객체라 딥 비교
 *  (참조 비교면 파서가 매번 새 객체를 만들어 "기본값" 배지가 영영 안 뜬다). */
export function isDefaultPointDef(def: PointDefinition): boolean {
    return (Object.keys(DEFAULT_POINT_DEFINITION) as (keyof PointDefinition)[]).every((k) =>
        k === "sim" ? sameTradeSimParams(def.sim, DEFAULT_POINT_DEFINITION.sim) : def[k] === DEFAULT_POINT_DEFINITION[k],
    );
}
