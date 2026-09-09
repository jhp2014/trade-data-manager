// 타점 정의 파서 — 영속 슬라이스(wb.pointDef.v1)와 SavedSet payload 가 **같은 유효성 정의**를 본다
// (themeStrength 의 parseThemeStrengthParams 선례 — 갈리면 저장 집합이 남의 값으로 평가된다).
// 관대한 병합: 필드 누락·오염은 그 필드만 기본값 — null 반환으로 통째 폐기하지 않는다(옛 저장물 호환).
import {
    APPROACH_MAX_PCT,
    APPROACH_MIN_PCT,
    DEFAULT_POINT_DEFINITION,
    DEFAULT_TRADE_SIM_PARAMS,
    QUALIFY_MAX_MIN,
    QUALIFY_MIN_MIN,
    type QualifyWindow,
    SIM_PCT_MAX,
    SIM_PCT_MIN,
    type PointDefinition,
    type PointJudgeDef,
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

/**
 * 자격 시각 창 목록 정규화 — 세션 창 클램프 · 정수 분 · 역전 정리 · 정렬 · **겹침(맞닿음 포함) 병합**.
 * 분이 정수라 `[540,600]`과 `[601,660]`은 같은 뜻이므로 맞닿은 구간도 합친다(안 합치면 같은 조건이
 * 두 줄로 저장돼 "구간 3개"가 화면마다 다르게 세어진다).
 * **세션 전부를 덮으면 빈 목록으로 접는다** — 빈 목록 = 전부 통과가 이 필드의 어휘라, 접지 않으면
 * "기본값인가" 판정과 요약 칩이 같은 상태를 두 가지로 말한다.
 * **세션 밖에 통째로 있는 구간은 버린다**(클램프하지 않는다) — `05:00~07:00` 을 양 끝으로 눌러 붙이면
 * `08:00~08:00` 이라는 1분짜리 퇴화 창이 서서 시그널이 사실상 전멸하는데, 화면엔 그 이유가 안 보인다.
 */
export function normalizeQualifyWindows(raw: readonly { from: number; to: number }[]): QualifyWindow[] {
    const clamp = (v: number): number => Math.round(Math.min(QUALIFY_MAX_MIN, Math.max(QUALIFY_MIN_MIN, v)));
    const spans = raw
        .filter((w) => Number.isFinite(w.from) && Number.isFinite(w.to))
        .map((w) => ({ from: Math.min(w.from, w.to), to: Math.max(w.from, w.to) }))
        .filter((w) => w.to >= QUALIFY_MIN_MIN && w.from <= QUALIFY_MAX_MIN) // 세션과 안 겹치면 조건이 아니다
        .map((w) => ({ from: clamp(w.from), to: clamp(w.to) }))
        .sort((a, b) => a.from - b.from);
    const out: QualifyWindow[] = [];
    for (const w of spans) {
        const last = out[out.length - 1];
        if (last && w.from <= last.to + 1) last.to = Math.max(last.to, w.to);
        else out.push({ ...w });
    }
    if (out.length === 1 && out[0]!.from <= QUALIFY_MIN_MIN && out[0]!.to >= QUALIFY_MAX_MIN) return [];
    return out;
}

/** 두 목록이 같은 조건인가 — 정규화된 목록끼리의 비교(기본값 판정·memo 키의 자). */
export const sameQualifyWindows = (a: readonly QualifyWindow[], b: readonly QualifyWindow[]): boolean =>
    a.length === b.length && a.every((w, i) => w.from === b[i]!.from && w.to === b[i]!.to);

/**
 * 자격 시각 목록의 **안정 키** — 배열은 파서를 지날 때마다 새 신원이라, memo deps 에 배열을 물리면
 * 무관한 노브(T 드래그)를 만질 때마다 1만 시그널 파생이 헛돈다. 문자열 하나로 내용을 대신 문다.
 */
export const qualifyKeyOf = (windows: readonly QualifyWindow[]): string => windows.map((w) => `${w.from}-${w.to}`).join(",");

// ── 정의별 파생 캐시(defDerived)의 키들 — 키 생성은 이 파일 한 곳이다(qualifyKeyOf 와 같은 이유:
//    두 벌이면 언젠가 다른 자로 재서 같은 정의가 다른 칸에 쌓인다).

/** 판정 노브 6개의 내용 키 — 자동 Point 파생·격자 특징·걷기가 전부 이 키에 좌우된다(T·시뮬은 안 본다). */
export const judgeKeyOf = (d: PointJudgeDef): string =>
    [d.baselineGateEok, d.renewalGateEok, qualifyKeyOf(d.qualifyWindows), d.mergeRisePct, d.bullOnly, d.approachPct].join("|");

/** 시뮬 노브 7개의 내용 키(취소 둘 포함) — null(off)은 "-" 로 굳혀 0 과 갈린다. */
export const simKeyOf = (p: TradeSimParams): string =>
    [p.entry.anchor, p.entry.pct, p.stopPct, p.takePct, p.trailUpPct, p.trailDownPct, p.cancelRisePct ?? "-", p.cancelAfterMin ?? "-"].join("|");

/** 체결 basis 는 취소 노브 둘에만 의존한다(useTradeSim 층 분리 계약) — 키도 그 둘만. */
export const cancelKeyOf = (p: Pick<TradeSimParams, "cancelRisePct" | "cancelAfterMin">): string =>
    `${p.cancelRisePct ?? "-"}|${p.cancelAfterMin ?? "-"}`;

/** 급타점 수 단면의 키 — (창 W, 상승률 r). judge 층 위의 슬라이스라 T·시뮬과 형제다. */
export const hotKeyOf = (w: number, r: number): string => `${w}|${r}`;

/**
 * 옛 저장물 승계 — 이 필드는 두 번 확장됐다(스칼라 → 창 하나 → 목록). 새 채널이 있으면 그쪽이 이긴다:
 * 두 채널이 함께 실린 저장물에서 옛 값이 새 편집을 되돌리면 안 된다.
 *  · `qualifyWindows`(현행) → 정규화만. 한쪽이 결손인 항목은 그 방향을 세션 끝으로 채운다(중간 형태
 *    채널과 같은 취급 — 같은 반열림 정보가 채널마다 다르게 읽히면 안 된다). 배열이 아닌 오염이면
 *    **채널이 없는 것으로 보고 다음 채널로 내려간다**(관대 병합 — 통째 폐기 금지 원칙).
 *  · `qualifyFromMin`/`qualifyToMin`(2026-09-07 반나절짜리 중간 형태) → 구간 하나
 *  · `excludeUptoMin`(그 분 **이하** 실격) → `[E+1, 세션 끝]`(같은 뜻). E 가 세션 끝 이상이면 "전량 제외"인데
 *    합집합 어휘로는 표현할 수 없어 **세션 끝 1분만 자격**으로 읽는다 — 조건 없음(전부 통과)으로 뒤집는 것보다
 *    원래 뜻(거의 전부 제외)에 가깝다. UI 로 그런 값을 만들 길은 없었다(옛 숫자칸의 상한 미설정 잔재).
 */
function qualifyWindowsOf(r: Partial<Record<keyof PointDefinition | "excludeUptoMin" | "qualifyFromMin" | "qualifyToMin", unknown>>): QualifyWindow[] {
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    if (Array.isArray(r.qualifyWindows)) {
        const spans = (r.qualifyWindows as unknown[])
            .map((w) => (w && typeof w === "object" ? { from: num((w as QualifyWindow).from), to: num((w as QualifyWindow).to) } : null))
            .filter((w): w is { from: number | null; to: number | null } => w !== null && (w.from !== null || w.to !== null))
            .map((w) => ({ from: w.from ?? QUALIFY_MIN_MIN, to: w.to ?? QUALIFY_MAX_MIN }));
        return normalizeQualifyWindows(spans);
    }
    const from = num(r.qualifyFromMin);
    const to = num(r.qualifyToMin);
    if (from !== null || to !== null) return normalizeQualifyWindows([{ from: from ?? QUALIFY_MIN_MIN, to: to ?? QUALIFY_MAX_MIN }]);
    const legacy = num(r.excludeUptoMin);
    if (legacy !== null && legacy >= 0) return normalizeQualifyWindows([{ from: Math.min(legacy + 1, QUALIFY_MAX_MIN), to: QUALIFY_MAX_MIN }]);
    return [];
}

export function parsePointDef(raw: unknown): PointDefinition | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Partial<Record<keyof PointDefinition, unknown>>;
    const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d); // num 재사용 금지 — ≥0 가드가 boolean 을 조용히 먹는다
    return {
        // 게이트는 **정수 억**으로 정규화 — pointsOf 의 `BigInt(gateEok)` 가 소수를 받으면 던진다
        // (RangeError). setPointDef 가 매번 이 파서를 지나므로 여기 한 곳이 전 입력 경로(타이핑·
        // 스트립 칸 클릭·SavedSet payload·영속 복원)의 유일한 가드다.
        baselineGateEok: Math.round(num(r.baselineGateEok, DEFAULT_POINT_DEFINITION.baselineGateEok)),
        renewalGateEok: Math.round(num(r.renewalGateEok, DEFAULT_POINT_DEFINITION.renewalGateEok)),
        qualifyWindows: qualifyWindowsOf(r),
        mergeRisePct: num(r.mergeRisePct, DEFAULT_POINT_DEFINITION.mergeRisePct),
        bullOnly: bool(r.bullOnly, DEFAULT_POINT_DEFINITION.bullOnly), // 2026-08-31 추가 — 옛 저장물엔 없어 기본 true 로 채워진다
        // 2026-09-05 추가(격자 v9 기준 밴드) — 옛 저장물엔 없어 기본 0.5, 도메인 [0, 0.5] 클램프(상한 = 굽는 하한).
        approachPct: Math.min(APPROACH_MAX_PCT, Math.max(APPROACH_MIN_PCT, num(r.approachPct, DEFAULT_POINT_DEFINITION.approachPct))),
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
        k === "sim"
            ? sameTradeSimParams(def.sim, DEFAULT_POINT_DEFINITION.sim)
            : k === "qualifyWindows"
              ? sameQualifyWindows(def.qualifyWindows, DEFAULT_POINT_DEFINITION.qualifyWindows) // 배열은 참조 비교가 늘 거짓
              : def[k] === DEFAULT_POINT_DEFINITION[k],
    );
}
