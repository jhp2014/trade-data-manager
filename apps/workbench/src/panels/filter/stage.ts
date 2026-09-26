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
} from "@trade-data-manager/market/domain";
import { anyCandleAxisOn, anyThemeCondOn, DEFAULT_THEME_ZONE, parseThemeZoneParams } from "@trade-data-manager/market/domain";

// 판정 알갱이 — 도메인 공용 어휘 재수출(필터 모듈들은 stage 만 본다).
export type { Grain };

export interface TimeRange { from: string; to: string } // HH:MM (양끝 포함)

/**
 * 술어 하나 — core `domain/cellset` 의 어휘를 **그대로** 흡수한다(2026-09-18 단계 ②).
 * `time` 만 workbench 소유다(엔진에도 같은 kind 가 있어 payload 가 글자까지 같다).
 */
export type FilterPredicate =
    | { kind: "time"; ranges: TimeRange[] }
    | Extract<CellPredicate, { kind: "cellValue" }>
    | Extract<CellPredicate, { kind: "priorHighBreak" }>
    // Daily 타점 생성기(돌파 사슬)와 캔들 술어(축 6개 — 옛 candleShape·% 셀 값의 후신, 2026-09-27).
    | Extract<CellPredicate, { kind: "breakout" }>
    | Extract<CellPredicate, { kind: "candle" }>
    // 테마 존(2026-09-26) — 옛 종단 themeStrength·존순위 셀 값의 후신. 판정·파서는 core themeZone 한 벌.
    | Extract<CellPredicate, { kind: "theme" }>;

export type PredicateKind = FilterPredicate["kind"];

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
        case "breakout": return false; // 노브가 전부 기본값을 가져 항상 조건이다
        case "candle": return !anyCandleAxisOn(p.axes); // 켜진 축이 없거나 경계가 없으면 조건이 아니다
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

let strippedTransitions = 0;
/** 이번 세션에 벗긴 전이 수식어 수(테마 enter 로 이주된 것 제외) — 로드 직후 로그용(읽으면 0 리셋). */
export function takeStrippedTransitionCount(): number {
    const n = strippedTransitions;
    strippedTransitions = 0;
    return n;
}

/**
 * 저장본 파싱 — 형태가 안 맞는 항목은 **통째로 버린다**(부분 복구 안 함). 반쯤 살아난 조건은
 * 화면에 멀쩡히 뜨면서 다른 걸 세기 때문에, 없는 편이 낫다.
 * ⚠ 예외 = **은퇴 kind**: 저장본을 통째 폐기하지 않고 **그 칸만** 걷는다(통째 폐기하면 이주 한 번에
 * 사용자 집합이 전멸한다). 걷는 단위가 술어가 아니라 **칸**인 이유: `[gridPoint, 대금≥N]` 에서
 * 은퇴 술어만 빼면 남은 AND 가 **사용자가 건 적 없는 더 넓은 조건**이 되어 OR 가지에 조용히
 * 합류한다(2026-09-27 리뷰). 칸이 빠지면 parseExpr 가 그 잎을 떨구고 연산자·괄호를 되짚는다.
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
        if (dropped > 0) continue; // 은퇴 술어가 든 칸은 칸째 걷는다(느슨해진 AND 를 남기지 않는다)
        // 칸 전이 이주(전이 은퇴 2026-09-27) — 「처음으로/직전 대비 상승」은 뜻이 "진입"이라 칸의 테마
        // 술어 enter 로 잇는다. 테마가 없거나 「하루 처음」이면 벗긴다(수는 로그로 — 조용히 사라지지 않게).
        const t = (raw as { transition?: unknown }).transition;
        let migrated = predicates;
        if (t === "firstTrue" || t === "improve") {
            if (predicates.some((q) => q.kind === "theme")) {
                migrated = predicates.map((q) => (q.kind === "theme" ? { ...q, enter: true } : q));
            } else strippedTransitions += 1;
        } else if (t === "firstOfDay") strippedTransitions += 1;
        out.push({
            id: s.id,
            name: typeof s.name === "string" ? s.name : undefined,
            enabled: s.enabled !== false,
            predicates: migrated,
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

function parsePredicate(o: unknown): FilterPredicate | typeof RETIRED | null {
    const p = o as { kind?: unknown };
    switch (p?.kind) {
        case "themeStrength": {
            // 옛 종단 테마 강도 → theme 이주(2026-09-26) — core 파서가 옛 params 모양(zoneRateN·0|60 창)을
            // 그대로 읽는다. payload 누락·오염은 **조건-off theme** 로 살린다(빈 술어가 정직하고 덜 파괴적이다).
            // 술어에 실려 있던 옛 전이(처음으로·직전 대비 상승)는 진입 노브로 잇는다(전이 은퇴 2026-09-27).
            const t = (o as { transition?: unknown }).transition;
            const enter = t === "firstTrue" || t === "improve" ? { enter: true as const } : {};
            const params = parseThemeZoneParams((o as { params?: unknown }).params);
            return params !== null
                ? { kind: "theme", ...params, ...enter }
                : { kind: "theme", ...DEFAULT_THEME_ZONE, countOn: false, baseRankOn: false, zoneRankOn: false, ...enter };
        }
        case "time": {
            const t = o as { ranges?: unknown; transition?: unknown };
            if (!Array.isArray(t.ranges) || !t.ranges.every(isFromToRange)) return null;
            if (t.transition !== undefined) strippedTransitions += 1; // 전이 은퇴 — 시간 술어의 전이는 벗긴다
            return { kind: "time", ranges: t.ranges };
        }
        // 셀 술어는 **core 파서 한 벌**을 그대로 쓴다(검증 두 벌 금지). core 의 null 이 여기선
        // "저장본 통째 폐기" 신호로 흐른다. 옛 술어 전이는 core 가 벗기고(theme 의 처음으로·직전 대비
        // 상승은 enter 로 이주 — parseThemeZoneParams), 여기서는 벗긴 수만 센다(로그).
        case "cellValue":
        case "priorHighBreak":
        case "breakout":
        case "candleShape":
        case "candle":
        case "theme": {
            const t = (o as { transition?: unknown }).transition;
            // zoneRank 셀 값도 theme 로 이주하므로(core) 그 전이도 enter 가 된다 — 벗김 수에서 뺀다.
            const toTheme = p.kind === "theme" || (p.kind === "cellValue" && (o as { field?: unknown }).field === "zoneRank");
            const migrates = toTheme && (t === "firstTrue" || t === "improve");
            if (t !== undefined && !migrates) strippedTransitions += 1;
            // 옛 % 셀 값의 다중 OR 구간은 캔들 축이 첫 구간만 잇는다(core) — 잃는 수를 로그로 남긴다.
            const cv = o as { kind?: unknown; field?: unknown; ranges?: unknown };
            if (cv.kind === "cellValue" && (cv.field === "ratePct" || cv.field === "minuteHighPct")
                && Array.isArray(cv.ranges) && cv.ranges.length > 1) {
                console.info(`[stage] 캔들 이주: ${String(cv.field)} 의 OR 구간 ${cv.ranges.length - 1}개는 첫 구간만 남습니다`);
            }
            return parseCellPredicate(o) as FilterPredicate | null;
        }
        default:
            return typeof p?.kind === "string" && RETIRED_KINDS.has(p.kind) ? RETIRED : null;
    }
}
