// 셀 술어 — **하루·셀 우주**(그날 전 (종목,분))의 판정 어휘. 규칙: .claude/decisions.md 「집합 = (낟알, 우주, 조건)」.
//
// ## 생성과 필터를 문법으로 가르지 않는다
// 옛 probe 로직 4종은 전부 `시점 술어 (+전이)` 로 환원된다 — 그래서 "후보 로직"이라는 개념이 없다.
// **조건 묶음(CellCondition) 하나가 곧 로직 하나**고, 로직 추가는 코드 추가가 아니라 조건 저장이다.
// 코드가 느는 건 새 **재료**(술어 종류)가 필요할 때뿐이다.
//
// ## 종단 술어(filter/stage.ts FilterPredicate)와 **동형**이되, 아직 한 타입이 아니다
// kind 이름·payload 모양·평가 규칙을 깔때기와 같은 자로 맞춘다(`time` 은 payload 가 글자까지 같다).
// 그런데 ① 에서 타입을 합치지는 **않는다**: `parseStages` 가 "모양 안 맞으면 저장본 **통째 폐기**" 라,
// 종단 술어 합집합을 넓히는 손이 미끄러지는 순간 사용자의 savedSets·filterStages 가 전멸한다.
// 물리 합류는 ②(우주 선언 승격)에서 한 번에 한다 — 그때 첫 번째로 합쳐질 종류가 `time` 이다.
//
// ## 파서 규칙이 종단과 **반대**다 — 폐기가 아니라 시드 폴백
// 하루 우주의 조건은 진실이 아니라 **로컬 설정**이다(진실은 라벨뿐). 그래서 깨진 저장물을 버리고
// 시드로 되돌아가도 잃는 게 없고, 오히려 되돌아가는 편이 안전하다. parseCellConditions 는
// **항목 단위로 건너뛰고**(성한 편집은 보존) 배열이 아닐 때만 null 을 돌려 호출자가 시드로 폴백한다.
//
// 값의 기준은 UN 한 벌이다 — rate·minuteHigh·trailingHighs.un 이 전부 "전일 종가 대비 %" 라
// 같은 공간에서 비교된다(probe 의 전례 그대로).

import { DEFAULT_CHAIN_FILTER, chainFilterKey, parseChainFilter, type ChainFilter } from "./chainFilter.js";
import { DEFAULT_THEME_ZONE, anyThemeCondOn, parseThemeZoneParams, type ThemeZoneParams } from "./themeZone.js";

// (전이 수식어 — firstOfDay·firstTrue·improve — 는 2026-09-27 은퇴했다. 실사용 뜻이 "진입"
//  하나였고 그건 테마 술어의 `enter` 노브(themeZone)가 판정 층에서 잇는다. 엔진의 종목별 상태
//  기계가 통째로 사라져 셀 판정이 다시 무상태가 됐다.)

/** 셀 값 필드 — 한 셀(종목·분)에서 읽히는 스칼라(전부 셀 배열 O(1)). 옛 `zoneRank` 는 theme 술어로 이주(2026-09-26). */
export type CellValueField = "ratePct" | "cumAmountEok" | "minuteAmountEok" | "minuteHighPct";

export interface CellValueFieldMeta {
    label: string;
    suffix: string;
}

export const CELL_VALUE_FIELDS: Record<CellValueField, CellValueFieldMeta> = {
    ratePct: { label: "등락률", suffix: "%" },
    cumAmountEok: { label: "누적대금", suffix: "억" },
    // 그 분 봉 자신의 대금 — 돌파 후보의 「돌파 대금 ≥ n」 필터가 이것이다(생성기 밖 — 필터는 구조를 안 바꾼다).
    minuteAmountEok: { label: "분봉 대금", suffix: "억" },
    minuteHighPct: { label: "분봉고가", suffix: "%" },
};

/**
 * 값 경계 — 종단 `AxisBound` 와 **같은 모양**이다(동형 유지). 하루 우주에서 실질적인 건 `value` 뿐이고,
 * `point`(타점 앵커)는 **받아들이되 평가에서 결손**이다 — "쓸 수 없는 술어는 불가가 아니라 결손"
 * 규칙을 ① 에서부터 지키는 자리(② 합류 때 같은 파서를 그대로 쓴다).
 */
export type CellBound = { kind: "value"; value: number } | { kind: "point"; point: string };

/** 한 구간. 한쪽이 없으면 반열림 — "이 값 이상"이 자연스러운 조작이라(종단 AxisValueRange 와 동형). */
export interface CellValueRange {
    from?: CellBound;
    to?: CellBound;
}

/** "HH:MM" 양끝 포함 — 종단 TimeRange 와 payload 가 같다. */
export interface CellTimeRange {
    from: string;
    to: string;
}

/**
 * 돌파 사슬 생성기(2026-09-24 — decisions 「Daily 타점 생성 = 돌파 사슬」). ① 격자 = **zigzag · 밴드 둘**,
 * ② 사슬 필터 = 봉 조건 식(AND/OR/NOT) + 칩·괄호·식 전체 순번(`chain` — chainFilter.ts). 이름표도 식의 조건이다.
 * 생성소의 일반 필터(양봉·시간대 …)는 그 뒤의 AND 라 순번 셈에 안 든다.
 */
export const BREAKOUT_ZIGZAG_MIN_PCT = 0.5;
export const BREAKOUT_ZIGZAG_MAX_PCT = 10;
export const BREAKOUT_BAND_MAX_PCT = 5;
export const DEFAULT_BREAKOUT: { zigzagPct: number; bandPct: number; chain: ChainFilter } = {
    zigzagPct: 2,
    bandPct: 0.5,
    chain: DEFAULT_CHAIN_FILTER,
};

/** 캔들 모양 — 봉 자체의 성질(돌파 후보에 AND 로 건다). 꼬리 등은 여기로 늘린다. */
export type CandleShape = "bull" | "bear";
export const CANDLE_SHAPE_LABEL: Record<CandleShape, string> = { bull: "양봉", bear: "음봉" };

/** 셀 술어 하나 — 전부 시점 술어다(전이 은퇴 2026-09-27 · 진입 판정은 theme 의 `enter` payload). */
export type CellPredicate =
    | { kind: "cellValue"; field: CellValueField; ranges: CellValueRange[] }
    | { kind: "priorHighBreak"; days: number }
    /** 돌파 사슬 후보(생성기) — 기준선은 `/point-grids` 의 확정 기준선(없으면 이름표가 전부 「고가 돌파」). */
    | { kind: "breakout"; zigzagPct: number; bandPct: number; chain: ChainFilter }
    | { kind: "candleShape"; shape: CandleShape }
    | { kind: "time"; ranges: CellTimeRange[] }
    /** 테마 존(2026-09-26 — 옛 종단 themeStrength·존순위 셀 값의 후신). 판정 한 벌은 themeZone.ts. */
    | ({ kind: "theme" } & ThemeZoneParams);

export type CellPredicateKind = CellPredicate["kind"];

/**
 * 술어 종류 스위치의 **자물쇠** — 종단 `unknownPredicate` 와 같은 이유·같은 수법.
 * 이 레포는 `noImplicitReturns` 가 없어 반환형에 null/undefined 가 있는 스위치는 case 를 빠뜨려도
 * 컴파일이 통과하고, 그때 증상이 조용하다(그 술어만 영영 거짓). 새 종류를 더하는 손이 **컴파일
 * 에러로** 평가기·비용등급·빈 판정 세 자리를 만나게 하는 것이 이 함수의 존재 이유 전부다.
 */
export function unknownCellPredicate(p: never): never {
    throw new Error(`알 수 없는 셀 술어 종류: ${JSON.stringify(p)}`);
}

/**
 * 비용 등급 — 평가 순서와 게으름의 근거(decisions 「하루 우주의 안전장치」).
 *  0 = 셀 배열 O(1) · 1 = 종목당 1회 사전계산 · 2 = 분 단면/멤버십(그 술어를 쓸 때만, 단락 뒤에만).
 */
export function costTierOf(p: CellPredicate): 0 | 1 | 2 {
    switch (p.kind) {
        case "cellValue":
            return 0;
        case "time":
            return 0;
        case "priorHighBreak":
        case "breakout":
            return 1;
        case "candleShape":
            return 0;
        case "theme":
            return 2; // 분 단면 + 멤버십 — 단락 뒤에만
        default:
            return unknownCellPredicate(p);
    }
}

/** 조건 하나 — 술어들의 AND. 끈 칸은 평가에서 통째로 빠진다. */
export interface CellCondition {
    id: string;
    name?: string;
    enabled: boolean;
    predicates: CellPredicate[];
}

export type CellConditions = CellCondition[];

// ── 식 트리(2026-09-19) ────────────────────────────────────────────────────
//
// 하루 우주의 조건은 원래부터 **OR(AND…) 2층**이었다(조건 = OR 가지, 술어 = AND 잎). 종단이 식 트리가
// 되면서 같은 문법을 여기도 쓴다 — 달라지는 건 **깊이 제한이 없고 부정이 붙는다**는 것뿐이다.

export type CellExpr =
    | { kind: "pred"; id: string; pred: CellPredicate; neg?: boolean }
    | { kind: "and"; id: string; of: CellExpr[]; neg?: boolean }
    | { kind: "or"; id: string; of: CellExpr[]; neg?: boolean };

/** 이 가지의 **가장 비싼** 재료 등급 — 단락 순서의 자(싼 가지부터 보고 비싼 재료를 늦게 부른다). */
export function cellExprTier(e: CellExpr): 0 | 1 | 2 {
    if (e.kind === "pred") return costTierOf(e.pred);
    let t: 0 | 1 | 2 = 0;
    for (const c of e.of) {
        const ct = cellExprTier(c);
        if (ct > t) t = ct;
    }
    return t;
}

/**
 * 평가에 들어갈 식 — 빈 술어 잎과 빈 묶음을 걷어낸다. 전부 걷히면 null.
 * **빈 조건은 "전부"가 아니라 빠진다** — 빈 술어를 참으로 세면 그 가지가 19만 셀을 통째로 통과시킨다.
 */
export function pruneCellExpr(e: CellExpr): CellExpr | null {
    if (e.kind === "pred") return isCellPredicateEmpty(e.pred) ? null : e;
    const of = e.of.map(pruneCellExpr).filter((c): c is CellExpr => c !== null);
    return of.length === 0 ? null : { ...e, of };
}

/**
 * 옛 평평한 조건 목록 → 식(루트 OR). **엔진의 유일한 입력은 식이고, 이 함수가 옛 계약의 어댑터다** —
 * 조건 = OR 가지(AND 묶음), 술어 = 그 가지의 잎. 꺼진 조건은 여기서 빠진다.
 */
export function exprOfCellConditions(conditions: CellConditions): CellExpr | null {
    const of: CellExpr[] = [];
    for (const c of conditions) {
        if (!c.enabled) continue;
        const preds = c.predicates.map((pred, i): CellExpr => ({ kind: "pred", id: `${c.id}#${i}`, pred }));
        const branch = pruneCellExpr({ kind: "and", id: c.id, of: preds });
        if (branch !== null) of.push(branch);
    }
    return of.length === 0 ? null : { kind: "or", id: "root", of };
}

/** 조건이 하나도 없는 술어(빈 구간 배열) — 평가에서 빼야 "무제한"이 "전부 탈락"으로 안 뒤집힌다. */
export function isCellPredicateEmpty(p: CellPredicate): boolean {
    switch (p.kind) {
        case "cellValue":
            return p.ranges.every((r) => !r.from && !r.to);
        case "time":
            return p.ranges.length === 0;
        case "priorHighBreak":
        case "breakout":
        case "candleShape":
            return false;
        case "theme":
            // 활성 하위 조건 0 = 조건 없음(존은 시선 도구) — 평가에서 빼야 "전부 통과"가 뜻대로 선다.
            return !anyThemeCondOn(p);
        default:
            return unknownCellPredicate(p);
    }
}

/** 돌파 사슬 **구조** 키 — 같은 키면 같은 사슬(엔진이 종목당 한 번만 훑는 단위). */
export function breakoutStructKeyOf(p: Pick<Extract<CellPredicate, { kind: "breakout" }>, "zigzagPct" | "bandPct">): string {
    return `bo|z${p.zigzagPct}|b${p.bandPct}`;
}

/** 돌파 **후보** 키 — 구조 + 사슬 필터 식(엔진 후보 메모의 단위). */
export function breakoutKeyOf(p: Extract<CellPredicate, { kind: "breakout" }>): string {
    return `${breakoutStructKeyOf(p)}|${chainFilterKey(p.chain)}`;
}


/** 이 조건 묶음이 테마 재료(분 단면·멤버십)를 쓰는가 — 로딩 표시·게으름 게이트가 본다. */
export function usesTheme(conditions: CellConditions): boolean {
    return conditions.some((c) => c.enabled && c.predicates.some((p) => p.kind === "theme"));
}

// ── 파서 ──────────────────────────────────────────────────────────────────
// 저장물은 panelUi(무검증 JSON 가방)에서 온다 — `usePanelUi` 는 raw 를 그대로 `as T` 로 캐스팅하므로
// 낡거나 깨진 blob 이 평가기까지 그대로 들어온다. 여기가 그 유일한 문지기다.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isField = (v: unknown): v is CellValueField => typeof v === "string" && v in CELL_VALUE_FIELDS;
const HM = /^\d{2}:\d{2}$/;
const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

function parseBound(raw: unknown): CellBound | undefined {
    if (!isObj(raw)) return undefined;
    if (raw.kind === "value" && typeof raw.value === "number" && Number.isFinite(raw.value)) return { kind: "value", value: raw.value };
    if (raw.kind === "point" && typeof raw.point === "string") return { kind: "point", point: raw.point };
    return undefined;
}

function parseRanges(raw: unknown): CellValueRange[] | null {
    if (!Array.isArray(raw)) return null;
    const out: CellValueRange[] = [];
    for (const r of raw) {
        if (!isObj(r)) continue;
        const from = parseBound(r.from);
        const to = parseBound(r.to);
        if (!from && !to) continue;
        out.push({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
    }
    return out;
}

/** 술어 하나 — 모양이 안 맞으면 null(그 술어만 건너뛴다). */
export function parseCellPredicate(raw: unknown): CellPredicate | null {
    if (!isObj(raw)) return null;
    switch (raw.kind) {
        case "cellValue": {
            // 옛 존순위 필드 → theme 술어 이주(2026-09-26). 값 상한만 존순위 컷으로 옮긴다 — 하한 구간은
            // 새 모양에 없다(decisions). 존 정의·재적은 옛날에도 payload 가 아니라 공용 노브(사실상 기본값)였다.
            if (raw.field === "zoneRank") {
                const ranges = parseRanges(raw.ranges) ?? [];
                const to = ranges.find((r) => r.to?.kind === "value")?.to;
                // 값 상한이 없으면(빈 ranges·하한만·point 경계) 컷을 **켜지 않는다** — 여기서 기본 상한을
                // 지어내면 "조건 없음"이 "≤2 활성"이 되고 하한(≥k)은 뜻이 뒤집힌다(themeStrength 깨진
                // payload 를 조건-off 로 살리는 것과 같은 원칙).
                const max = to?.kind === "value" ? Math.max(1, Math.floor(to.value)) : null;
                return {
                    kind: "theme", ...DEFAULT_THEME_ZONE,
                    countOn: false, baseRankOn: false,
                    zoneRankOn: max !== null,
                    zoneRankMax: max ?? DEFAULT_THEME_ZONE.zoneRankMax,
                    // 옛 전이(처음으로·직전 대비 상승) → 진입 노브(themeZone 파서와 같은 규칙).
                    ...(raw.transition === "firstTrue" || raw.transition === "improve" ? { enter: true } : {}),
                };
            }
            if (!isField(raw.field)) return null;
            const ranges = parseRanges(raw.ranges);
            if (ranges === null) return null;
            return { kind: "cellValue", field: raw.field, ranges };
        }
        case "priorHighBreak": {
            if (typeof raw.days !== "number" || !Number.isFinite(raw.days)) return null;
            return { kind: "priorHighBreak", days: Math.max(1, Math.floor(raw.days)) };
        }
        // 노브는 **폐기가 아니라 클램프** — 범위 밖 값 하나로 술어(와 종단이면 저장본 통째)를 버리지 않는다.
        case "breakout":
            return {
                kind: "breakout",
                zigzagPct: clampNum(raw.zigzagPct, BREAKOUT_ZIGZAG_MIN_PCT, BREAKOUT_ZIGZAG_MAX_PCT, DEFAULT_BREAKOUT.zigzagPct),
                bandPct: clampNum(raw.bandPct, 0, BREAKOUT_BAND_MAX_PCT, DEFAULT_BREAKOUT.bandPct),
                // 식 이전 저장물(봉 조건 필드 + 술어 이름표)은 전부 AND 로 이은 식으로 옮긴다. 사슬 필터가
                // 아예 없으면 처음 1개(전부로 읽으면 하루 수만 봉이 쏟아진다).
                chain: parseChainFilter(raw.chain, raw.label),
            };
        case "candleShape":
            return raw.shape === "bull" || raw.shape === "bear" ? { kind: "candleShape", shape: raw.shape } : null;
        case "time": {
            if (!Array.isArray(raw.ranges)) return null;
            const ranges: CellTimeRange[] = [];
            for (const r of raw.ranges) {
                if (!isObj(r) || typeof r.from !== "string" || typeof r.to !== "string") continue;
                if (!HM.test(r.from) || !HM.test(r.to)) continue;
                ranges.push({ from: r.from, to: r.to });
            }
            return { kind: "time", ranges };
        }
        case "theme": {
            // 옛 전이 저장물은 parseThemeZoneParams 가 `raw.transition` 을 읽어 enter 로 잇는다.
            const params = parseThemeZoneParams(raw);
            return params === null ? null : { kind: "theme", ...params };
        }
        default:
            return null;
    }
}

/**
 * 조건 묶음 전체 — **배열이 아니면 null**(호출자가 시드로 폴백), 배열이면 성한 항목만 남긴다.
 * 종단 `parseStages` 의 "통째 폐기"와 반대 방향인 이유는 머리 주석에 있다(진실 vs 로컬 설정).
 * 빈 배열은 **유효한 상태**다 — "조건 없음 = 안 보여줌"이 설계된 상태라 시드로 되돌리지 않는다.
 */
export function parseCellConditions(raw: unknown): CellConditions | null {
    if (!Array.isArray(raw)) return null;
    const out: CellConditions = [];
    for (const c of raw) {
        if (!isObj(c) || typeof c.id !== "string" || c.id.length === 0) continue;
        if (!Array.isArray(c.predicates)) continue;
        const predicates: CellPredicate[] = [];
        for (const p of c.predicates) {
            const parsed = parseCellPredicate(p);
            if (parsed) predicates.push(parsed);
        }
        out.push({
            id: c.id,
            ...(typeof c.name === "string" ? { name: c.name } : {}),
            enabled: c.enabled !== false, // 부재 = 켬(옛 저장물 승계)
            predicates,
        });
    }
    return out;
}
