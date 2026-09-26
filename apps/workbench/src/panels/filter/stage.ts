// 필터 단계 모델(순수) — 조건의 **모양**. 판정도 정산도 여기 없다(판정 = core cellset 엔진).
//
// 2026-09-26 종단 폐기: 옛 종단 술어 7종(그룹·축밴드·축값·날짜·결과 2종·급타점)과 gridPoint 가
// 은퇴했다 — 남은 종류는 전부 하루·셀 우주(종목×분)의 술어고, 층위도 전부 타점이다.
// 은퇴 kind 가 든 저장물은 파서가 그 술어만 걷어낸다(수는 로그 — decisions 「종단 트랙 전면 폐기」).
//
// **조건은 패널의 소유물이 아니다.** "돌파 사슬" 같은 조건이 술어 객체가 되는 순간 그 조건은
// 어느 판도 아닌 한 곳(식 트리)에 모여 순서 변경·on/off·저장이 된다.
import {
    parseCellPredicate,
    type CellPredicate,
    type Grain,
    type Transition,
} from "@trade-data-manager/market/domain";
import { anyThemeCondOn, DEFAULT_THEME_ZONE, parseThemeZoneParams } from "@trade-data-manager/market/domain";

// 판정 알갱이 — 도메인 공용 어휘 재수출(필터 모듈들은 stage 만 본다).
export type { Grain };

export interface TimeRange { from: string; to: string } // HH:MM (양끝 포함)

/**
 * 술어 하나 — core `domain/cellset` 의 어휘를 **그대로** 흡수한다(2026-09-18 단계 ②).
 * `time` 만 workbench 소유다(엔진에도 같은 kind 가 있어 payload 가 글자까지 같다).
 */
export type FilterPredicate =
    | { kind: "time"; ranges: TimeRange[]; transition?: Transition }
    | Extract<CellPredicate, { kind: "cellValue" }>
    | Extract<CellPredicate, { kind: "priorHighBreak" }>
    // Daily 타점 생성기(돌파 사슬)와 캔들 모양 필터(decisions 「Daily 타점 생성 = 돌파 사슬」).
    | Extract<CellPredicate, { kind: "breakout" }>
    | Extract<CellPredicate, { kind: "candleShape" }>
    // 테마 존(2026-09-26) — 옛 종단 themeStrength·존순위 셀 값의 후신. 판정·파서는 core themeZone 한 벌.
    | Extract<CellPredicate, { kind: "theme" }>;

export type PredicateKind = FilterPredicate["kind"];

/** 전이 수식어 재수출 — 필터 모듈들은 stage 만 본다(core 경로가 바뀌어도 한 줄). */
export type { Transition };

/**
 * 술어 종류 스위치의 **자물쇠**. 이 레포는 `noImplicitReturns` 가 없어서, 반환형에 `undefined`/`null`
 * 이 있는 스위치는 case 를 빠뜨려도 컴파일이 통과한다 — 그때의 증상이 조용하다(그 종류가 "무제한
 * 통과"로 새거나 보드에서 "(지워짐)"으로 보인다). 새 술어 종류를 더하는 손이 **컴파일 에러로**
 * 이 스위치들을 만나게 하는 것이 이 함수의 존재 이유 전부다.
 */
export function unknownPredicate(p: never): never {
    throw new Error(`알 수 없는 술어 종류: ${JSON.stringify(p)}`);
}

/** 단계 하나 — 술어들의 AND. 단계끼리도 AND 지만, 나뉘어 있어야 따로 끄고 켤 수 있다. */
export interface FilterStage {
    id: string;
    /** 손으로 준 이름. 없으면 조건에서 자동 라벨. */
    name?: string;
    /** 끈 단계는 평가에서 통째로 빠진다 — 지우지 않고 잠깐 빼보는 게 "이 조건이 일을 하나"를 눈으로 확인하는 손짓이다. */
    enabled: boolean;
    predicates: FilterPredicate[];
    /**
     * **전이 수식어(칸 수준)** — 술어 AND 전체를 하나의 f 로 보고 그 엣지에서만 건다.
     * 술어에도 같은 필드가 있고 **술어 하나짜리 칸에서 둘은 동치**다(core engine 테스트가 잠갔다).
     */
    transition?: Transition;
}

/**
 * "무거운 조건"인가 — 날짜 자동 스킵 상한을 줄이는 자(사슬·테마 분 단면). WorksetPanel·
 * DailyExplorePanel 이 한 벌로 쓴다.
 */
export function isHeavyCellPredicate(p: FilterPredicate): boolean {
    return p.kind === "breakout" || p.kind === "theme";
}

/** 조건이 하나도 없는 술어(빈 배열·전부 꺼진 컷) — 평가에서 빼야 "무제한"이 "전부 미배치"로 안 뒤집힌다. */
export function isPredicateEmpty(p: FilterPredicate): boolean {
    switch (p.kind) {
        case "time": return p.ranges.length === 0;
        case "cellValue": return p.ranges.every((r) => !r.from && !r.to);
        case "priorHighBreak": return false; // 창 하나라 항상 조건이다
        case "breakout":
        case "candleShape": return false; // 노브가 전부 기본값을 가져 항상 조건이다
        case "theme": return !anyThemeCondOn(p); // 활성 하위 조건 0 = 무제한 통과(core 빈 판정과 같은 자)
        default: return unknownPredicate(p); // 자물쇠 — 빠뜨리면 그 종류가 "무제한 통과"로 샌다
    }
}

/** 실제로 평가에 들어가는 단계 — 켜져 있고 빈 술어가 아닌 게 하나라도 있는 것. */
export function activeStages(stages: readonly FilterStage[]): FilterStage[] {
    return stages.filter((s) => s.enabled && s.predicates.some((p) => !isPredicateEmpty(p)));
}

// (알갱이 기계 — GrainLookup·predicateGrain·autoGrain·funnelOrder — 는 2026-09-26 종단 폐기로 은퇴했다.
//  남은 술어는 전부 셀(종목×분) 위의 조건이라 층위가 타점 하나다.)

/** 이 단계가 이미 정한 종류(빈 단계 = 아직 없음). 빈 술어도 종류는 말한다 — 편집 중인 자리라서. */
export function stageKind(s: FilterStage): PredicateKind | undefined {
    return s.predicates[0]?.kind;
}

export const newStageId = (): string => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 새 조건 하나 — 식 트리와 평평한 리스트가 **같은 자를 쓰게** 여기 한 곳에서 만든다. */
export const newStage = (predicates: FilterPredicate[] = []): FilterStage =>
    ({ id: newStageId(), enabled: true, predicates });


// ── 영속 검증 ──────────────────────────────────────────────────────────────

/** 은퇴 kind(종단 폐기 2026-09-26) — 이 술어는 저장물에서 **그 술어만** 걷어낸다(집합 통째 폐기 아님). */
const RETIRED_KINDS = new Set(["group", "axisBand", "axisValue", "date", "outcome", "outcomeRecovery", "hotPoints", "gridPoint"]);
const RETIRED = Symbol("retired-predicate");

let retiredPredicates = 0;
/** 이번 세션에 걷어낸 은퇴 술어 수 — 로드 직후 로그용(읽으면 0 으로 리셋). */
export function takeRetiredPredicateCount(): number {
    const n = retiredPredicates;
    retiredPredicates = 0;
    return n;
}

/**
 * 저장본 파싱 — 형태가 안 맞는 항목은 **통째로 버린다**(부분 복구 안 함). 반쯤 살아난 조건은
 * 화면에 멀쩡히 뜨면서 다른 걸 세기 때문에, 없는 편이 낫다.
 * ⚠ 예외 = **은퇴 kind**: 그 술어만 걷어낸다(통째 폐기하면 이주 한 번에 사용자 집합이 전멸한다 —
 * decisions 「저장물 모양이 바뀌는 커밋은 하나로 모은다」). 술어가 다 걷힌 칸은 칸째 사라진다
 * (parseExpr 가 그 잎을 떨구고 연산자·괄호를 되짚는다 — expr.ts 한 벌).
 */
export function parseStages(o: unknown): FilterStage[] | null {
    if (!Array.isArray(o)) return null;
    const out: FilterStage[] = [];
    for (const raw of o) {
        const s = raw as { id?: unknown; name?: unknown; enabled?: unknown; predicates?: unknown };
        if (typeof s?.id !== "string" || !Array.isArray(s.predicates)) return null;
        const predicates: FilterPredicate[] = [];
        let dropped = 0;
        for (const p of s.predicates) {
            const parsed = parsePredicate(p);
            if (parsed === RETIRED) { dropped += 1; retiredPredicates += 1; continue; }
            if (!parsed) return null;
            predicates.push(parsed);
        }
        if (predicates.length === 0 && dropped > 0) continue; // 은퇴 술어뿐이던 칸 — 칸째 걷는다
        const t = (raw as { transition?: unknown }).transition;
        out.push({
            id: s.id,
            name: typeof s.name === "string" ? s.name : undefined,
            enabled: s.enabled !== false,
            predicates,
            ...(isTransitionValue(t) ? { transition: t } : {}),
        });
    }
    return out;
}

/** 날짜·시간 구간 — 양끝 필수 문자열(반열림은 이 종류엔 없다). */
const isFromToRange = (o: unknown): o is { from: string; to: string } => {
    if (typeof o !== "object" || o === null) return false;
    const r = o as { from?: unknown; to?: unknown };
    return typeof r.from === "string" && typeof r.to === "string";
};

/** 전이 수식어 값인가 — core 어휘 3종(모르는 값은 전이 없음으로 떨군다). */
const isTransitionValue = (v: unknown): v is Transition =>
    v === "firstOfDay" || v === "firstTrue" || v === "improve";

function parsePredicate(o: unknown): FilterPredicate | typeof RETIRED | null {
    const p = o as { kind?: unknown };
    switch (p?.kind) {
        case "themeStrength": {
            // 옛 종단 테마 강도 → theme 이주(2026-09-26) — core 파서가 옛 params 모양(zoneRateN·0|60 창)을
            // 그대로 읽는다. payload 누락·오염은 **조건-off theme** 로 살린다(빈 술어가 정직하고 덜 파괴적이다).
            const params = parseThemeZoneParams((o as { params?: unknown }).params);
            return params !== null
                ? { kind: "theme", ...params }
                : { kind: "theme", ...DEFAULT_THEME_ZONE, countOn: false, baseRankOn: false, zoneRankOn: false };
        }
        case "time": {
            const t = o as { ranges?: unknown; transition?: unknown };
            if (!Array.isArray(t.ranges) || !t.ranges.every(isFromToRange)) return null;
            // 전이는 옵셔널 — 모르는 값은 **떨군다**(조용히 다른 뜻이 되지 않게). 왕복 보존은 골든이 지킨다.
            return { kind: "time", ranges: t.ranges, ...(isTransitionValue(t.transition) ? { transition: t.transition } : {}) };
        }
        // 셀 술어는 **core 파서 한 벌**을 그대로 쓴다(검증 두 벌 금지). core 의 null 이 여기선
        // "저장본 통째 폐기" 신호로 흐른다.
        case "cellValue":
        case "priorHighBreak":
        case "breakout":
        case "candleShape":
        case "theme":
            return parseCellPredicate(o) as FilterPredicate | null;
        default:
            return typeof p?.kind === "string" && RETIRED_KINDS.has(p.kind) ? RETIRED : null;
    }
}
