// 타점 정의 파서 — 영속 슬라이스(wb.pointDef.v1)와 SavedSet payload 가 **같은 유효성 정의**를 본다
// (themeStrength 의 parseThemeStrengthParams 선례 — 갈리면 저장 집합이 남의 값으로 평가된다).
// 관대한 병합: 필드 누락·오염은 그 필드만 기본값 — null 반환으로 통째 폐기하지 않는다(옛 저장물 호환).
import { APPROACH_MAX_PCT, APPROACH_MIN_PCT, DEFAULT_POINT_DEFINITION, TOLERANCE_MAX_PCT, TOLERANCE_MIN_PCT, type PointDefinition } from "@trade-data-manager/market/domain";

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
    };
}

/** 기본값과 동일한가 — 머리 UI 의 "기본값" 배지·되돌리기 노출 판정. */
export function isDefaultPointDef(def: PointDefinition): boolean {
    return (Object.keys(DEFAULT_POINT_DEFINITION) as (keyof PointDefinition)[]).every((k) => def[k] === DEFAULT_POINT_DEFINITION[k]);
}
