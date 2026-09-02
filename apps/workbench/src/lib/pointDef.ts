// 타점 정의 파서 — 영속 슬라이스(wb.pointDef.v1)와 SavedSet payload 가 **같은 유효성 정의**를 본다
// (themeStrength 의 parseThemeStrengthParams 선례 — 갈리면 저장 집합이 남의 값으로 평가된다).
// 관대한 병합: 필드 누락·오염은 그 필드만 기본값 — null 반환으로 통째 폐기하지 않는다(옛 저장물 호환).
import { DEFAULT_POINT_DEFINITION, type PointDefinition } from "@trade-data-manager/market/domain";

export function parsePointDef(raw: unknown): PointDefinition | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Partial<Record<keyof PointDefinition, unknown>>;
    const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d); // num 재사용 금지 — ≥0 가드가 boolean 을 조용히 먹는다
    return {
        baselineGateEok: num(r.baselineGateEok, DEFAULT_POINT_DEFINITION.baselineGateEok),
        renewalGateEok: num(r.renewalGateEok, DEFAULT_POINT_DEFINITION.renewalGateEok),
        excludeUptoMin: num(r.excludeUptoMin, DEFAULT_POINT_DEFINITION.excludeUptoMin),
        mergeRisePct: num(r.mergeRisePct, DEFAULT_POINT_DEFINITION.mergeRisePct),
        bullOnly: bool(r.bullOnly, DEFAULT_POINT_DEFINITION.bullOnly), // 2026-08-31 추가 — 옛 저장물엔 없어 기본 true 로 채워진다
        lens: r.lens === "high" ? "high" : DEFAULT_POINT_DEFINITION.lens, // 2026-09-02 추가 — 옛 저장물·오염은 갱신 렌즈
    };
}

/** 기본값과 동일한가 — 머리 UI 의 "기본값" 배지·되돌리기 노출 판정. */
export function isDefaultPointDef(def: PointDefinition): boolean {
    return (Object.keys(DEFAULT_POINT_DEFINITION) as (keyof PointDefinition)[]).every((k) => def[k] === DEFAULT_POINT_DEFINITION[k]);
}
