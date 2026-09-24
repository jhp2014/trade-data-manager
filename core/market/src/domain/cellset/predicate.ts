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

import { CHAIN_FIRST_K_MAX, DEFAULT_CHAIN_FILTER, type BreakoutLabelFilter, type ChainFilter, type ChainRange } from "./breakoutChain.js";

/**
 * 전이 수식어 — 시점 술어를 **엣지**로 바꾸는 한 겹. 어휘가 셋인 이유는 이주 등가성이다:
 *  · `firstTrue`   = `f(t) ∧ ¬f(t−1)` — 매 상승 엣지(하루에 여러 번).
 *  · `firstOfDay`  = 하루 **첫** 참 1회. 옛 probe ②③(surgeFired/priorFired 플래그)의 등가물 —
 *                    이게 없으면 rate 가 오르내릴 때마다 재발화해 후보 수가 조용히 는다.
 *  · `improve`     = **직전에 참이 아니었거나**(결손·미관찰·존 밖 포함) 밑값이 개선. 옛 zoneRise 의
 *                    `prevZoneRank === null || z.rank < prevZoneRank` 등가물 — "직전 미참"을 포함하는
 *                    것이 존 재진입 재발화의 조건이고, 국어("직전 대비 상승")와도 맞는다.
 *
 * 개선 방향은 payload 가 아니라 **술어 종류가 안다**(zoneRank 는 감소가 개선) — 사용자가 고를 일이
 * 없고, 두면 "순위가 올라간다"를 반대로 저장한 조건이 조용히 생긴다.
 */
export type Transition = "firstOfDay" | "firstTrue" | "improve";

export const TRANSITIONS: readonly Transition[] = ["firstOfDay", "firstTrue", "improve"];

export const TRANSITION_LABEL: Record<Transition, string> = {
    firstOfDay: "하루 처음",
    firstTrue: "처음으로",
    improve: "직전 대비 상승",
};

/** 셀 값 필드 — 한 셀(종목·분)에서 읽히는 스칼라. `zoneRank` 만 분 단면이 필요해 비용 등급이 다르다. */
export type CellValueField = "ratePct" | "cumAmountEok" | "minuteAmountEok" | "minuteHighPct" | "zoneRank";

export interface CellValueFieldMeta {
    label: string;
    suffix: string;
    /** 개선 방향 — `improve` 전이가 보는 자(up = 클수록 좋다, down = 작을수록 좋다). */
    improve: "up" | "down";
}

export const CELL_VALUE_FIELDS: Record<CellValueField, CellValueFieldMeta> = {
    ratePct: { label: "등락률", suffix: "%", improve: "up" },
    cumAmountEok: { label: "누적대금", suffix: "억", improve: "up" },
    // 그 분 봉 자신의 대금 — 돌파 후보의 「돌파 대금 ≥ n」 필터가 이것이다(생성기 밖 — 필터는 구조를 안 바꾼다).
    minuteAmountEok: { label: "분봉 대금", suffix: "억", improve: "up" },
    minuteHighPct: { label: "분봉고가", suffix: "%", improve: "up" },
    zoneRank: { label: "존순위", suffix: "위", improve: "down" },
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
 * 돌파 사슬 생성기(2026-09-24 — decisions 「Daily 타점 생성 = 돌파 사슬」). 구조 노브는 **zigzag · 밴드 둘**,
 * 후보 고르기는 **사슬 필터**(`chain` — 봉 조건 + 순번)와 이름표(`label`, 봉 조건의 하나)다.
 * 생성소의 일반 필터(양봉·시간대 …)는 그 뒤의 AND 라 순번 셈에 안 든다.
 */
export const BREAKOUT_ZIGZAG_MIN_PCT = 0.5;
export const BREAKOUT_ZIGZAG_MAX_PCT = 10;
export const BREAKOUT_BAND_MAX_PCT = 5;
export const DEFAULT_BREAKOUT: { zigzagPct: number; bandPct: number; label: BreakoutLabelFilter; chain: ChainFilter } = {
    zigzagPct: 2,
    bandPct: 0.5,
    label: "all",
    chain: DEFAULT_CHAIN_FILTER,
};

/** 캔들 모양 — 봉 자체의 성질(돌파 후보에 AND 로 건다). 꼬리 등은 여기로 늘린다. */
export type CandleShape = "bull" | "bear";
export const CANDLE_SHAPE_LABEL: Record<CandleShape, string> = { bull: "양봉", bear: "음봉" };

/**
 * 셀 술어 하나. 전이는 **술어 줄과 칸 양쪽**에 놓일 수 있다(CellCondition.transition) — UI 문법이
 * "줄 토글"로 가든 "감싸는 블럭"으로 가든 저장물이 안 흔들리게 하는 장치다. 술어 하나짜리 칸에서
 * 두 자리는 **정확히 같은 결과**를 낸다(engine 테스트가 그 동치성을 잠근다).
 */
export type CellPredicate =
    | { kind: "cellValue"; field: CellValueField; ranges: CellValueRange[]; transition?: Transition }
    | { kind: "priorHighBreak"; days: number; transition?: Transition }
    | { kind: "gridPoint"; transition?: Transition }
    /** 돌파 사슬 후보(생성기) — 기준선은 `/point-grids` 의 확정 기준선(없으면 이름표가 전부 「고가 돌파」). */
    | { kind: "breakout"; zigzagPct: number; bandPct: number; label: BreakoutLabelFilter; chain: ChainFilter; transition?: Transition }
    | { kind: "candleShape"; shape: CandleShape; transition?: Transition }
    | { kind: "time"; ranges: CellTimeRange[]; transition?: Transition };

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
            return p.field === "zoneRank" ? 2 : 0;
        case "time":
            return 0;
        case "priorHighBreak":
        case "gridPoint":
        case "breakout":
            return 1;
        case "candleShape":
            return 0;
        default:
            return unknownCellPredicate(p);
    }
}

/** 조건 하나 — 술어들의 AND + (선택) 칸 전체에 걸리는 전이. 끈 칸은 평가에서 통째로 빠진다. */
export interface CellCondition {
    id: string;
    name?: string;
    enabled: boolean;
    predicates: CellPredicate[];
    transition?: Transition;
}

export type CellConditions = CellCondition[];

// ── 식 트리(2026-09-19) ────────────────────────────────────────────────────
//
// 하루 우주의 조건은 원래부터 **OR(AND…) 2층**이었다(조건 = OR 가지, 술어 = AND 잎). 종단이 식 트리가
// 되면서 같은 문법을 여기도 쓴다 — 달라지는 건 **깊이 제한이 없고 부정이 붙는다**는 것뿐이다.
//
// ⚠ **전이 수식어는 잎과 AND 노드에만** 붙는다(decisions.md 「집합 편성 재설계」). `¬(처음으로 f)` 나
// `처음으로 (a ∨ b)` 는 뜻이 정의돼 있지 않다 — 정의되지 않은 것을 조용히 아무 값으로 계산하는 대신
// 문법에서 자리를 안 만든다.

export type CellExpr =
    | { kind: "pred"; id: string; pred: CellPredicate; neg?: boolean }
    | { kind: "and"; id: string; of: CellExpr[]; neg?: boolean; transition?: Transition }
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
        const branch = pruneCellExpr({ kind: "and", id: c.id, of: preds, ...(c.transition ? { transition: c.transition } : {}) });
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
        case "gridPoint":
        case "breakout":
        case "candleShape":
            return false;
        default:
            return unknownCellPredicate(p);
    }
}

/** 돌파 사슬 **구조** 키 — 같은 키면 같은 사슬(엔진이 종목당 한 번만 훑는 단위). */
export function breakoutStructKeyOf(p: Pick<Extract<CellPredicate, { kind: "breakout" }>, "zigzagPct" | "bandPct">): string {
    return `bo|z${p.zigzagPct}|b${p.bandPct}`;
}

const rangeKey = (r: ChainRange | undefined): string => (r === undefined ? "-" : `${r.min ?? ""}~${r.max ?? ""}`);

/** 돌파 **후보** 키 — 구조 + 이름표 + 사슬 필터(엔진 후보 메모의 단위). 전이는 뺀다. */
export function breakoutKeyOf(p: Extract<CellPredicate, { kind: "breakout" }>): string {
    const f = p.chain;
    return [
        breakoutStructKeyOf(p),
        p.label,
        `p${rangeKey(f.pos)}`,
        `a${f.amountEok ?? "-"}`,
        `oh${rangeKey(f.openHigh)}`,
        `oc${rangeKey(f.openClose)}`,
        `s${f.sessionHigh ?? "-"}`,
        `k${f.firstK ?? "all"}`,
    ].join("|");
}

/** 이 조건 묶음이 격자 재료를 쓰는가 — 패널의 로딩·오류 게이트가 본다(안 쓰면 격자 실패가 화면을 죽이면 안 된다). */
export function usesGridPoint(conditions: CellConditions): boolean {
    return conditions.some((c) => c.enabled && c.predicates.some((p) => p.kind === "gridPoint"));
}

/** 이 조건 묶음이 분 단면(존 순위)을 쓰는가 — 테마 재료 로딩 표시·게으름 게이트가 본다. */
export function usesZoneRank(conditions: CellConditions): boolean {
    return conditions.some((c) => c.enabled && c.predicates.some((p) => p.kind === "cellValue" && p.field === "zoneRank"));
}

// ── 파서 ──────────────────────────────────────────────────────────────────
// 저장물은 panelUi(무검증 JSON 가방)에서 온다 — `usePanelUi` 는 raw 를 그대로 `as T` 로 캐스팅하므로
// 낡거나 깨진 blob 이 평가기까지 그대로 들어온다. 여기가 그 유일한 문지기다.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isTransition = (v: unknown): v is Transition => typeof v === "string" && (TRANSITIONS as readonly string[]).includes(v);
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

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 사슬 필터 구간 — 양끝이 다 없으면 조건 없음(undefined). `int` 면 0 이상 정수(봉 순번). */
function parseChainRange(raw: unknown, int = false): ChainRange | undefined {
    if (!isObj(raw)) return undefined;
    const fix = (v: unknown): number | undefined => (finite(v) ? (int ? Math.max(0, Math.floor(v)) : v) : undefined);
    const min = fix(raw.min);
    const max = fix(raw.max);
    if (min === undefined && max === undefined) return undefined;
    return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
}

/** 사슬 필터 — 없거나 깨졌으면 기본(처음 1개). 조건 하나가 깨지면 그 조건만 없음. */
export function parseChainFilter(raw: unknown): ChainFilter {
    if (!isObj(raw)) return DEFAULT_CHAIN_FILTER;
    const pos = parseChainRange(raw.pos, true);
    const openHigh = parseChainRange(raw.openHigh);
    const openClose = parseChainRange(raw.openClose);
    const amountEok = finite(raw.amountEok) && raw.amountEok > 0 ? raw.amountEok : undefined;
    const sessionHigh = raw.sessionHigh === "yes" || raw.sessionHigh === "no" ? raw.sessionHigh : undefined;
    const firstK =
        raw.firstK === null ? null : finite(raw.firstK) ? Math.min(CHAIN_FIRST_K_MAX, Math.max(1, Math.floor(raw.firstK))) : 1;
    return {
        ...(pos ? { pos } : {}),
        ...(amountEok !== undefined ? { amountEok } : {}),
        ...(openHigh ? { openHigh } : {}),
        ...(openClose ? { openClose } : {}),
        ...(sessionHigh ? { sessionHigh } : {}),
        firstK,
    };
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
    const transition = isTransition(raw.transition) ? { transition: raw.transition } : {};
    switch (raw.kind) {
        case "cellValue": {
            if (!isField(raw.field)) return null;
            const ranges = parseRanges(raw.ranges);
            if (ranges === null) return null;
            return { kind: "cellValue", field: raw.field, ranges, ...transition };
        }
        case "priorHighBreak": {
            if (typeof raw.days !== "number" || !Number.isFinite(raw.days)) return null;
            return { kind: "priorHighBreak", days: Math.max(1, Math.floor(raw.days)), ...transition };
        }
        case "gridPoint":
            return { kind: "gridPoint", ...transition };
        // 노브는 **폐기가 아니라 클램프** — 범위 밖 값 하나로 술어(와 종단이면 저장본 통째)를 버리지 않는다.
        case "breakout":
            return {
                kind: "breakout",
                zigzagPct: clampNum(raw.zigzagPct, BREAKOUT_ZIGZAG_MIN_PCT, BREAKOUT_ZIGZAG_MAX_PCT, DEFAULT_BREAKOUT.zigzagPct),
                bandPct: clampNum(raw.bandPct, 0, BREAKOUT_BAND_MAX_PCT, DEFAULT_BREAKOUT.bandPct),
                label: raw.label === "baseline" || raw.label === "high" ? raw.label : "all",
                // 사슬 필터가 없는 옛 저장물 = 처음 1개(전부로 읽으면 하루 수만 봉이 쏟아진다).
                chain: parseChainFilter(raw.chain),
                ...transition,
            };
        case "candleShape":
            return raw.shape === "bull" || raw.shape === "bear" ? { kind: "candleShape", shape: raw.shape, ...transition } : null;
        case "time": {
            if (!Array.isArray(raw.ranges)) return null;
            const ranges: CellTimeRange[] = [];
            for (const r of raw.ranges) {
                if (!isObj(r) || typeof r.from !== "string" || typeof r.to !== "string") continue;
                if (!HM.test(r.from) || !HM.test(r.to)) continue;
                ranges.push({ from: r.from, to: r.to });
            }
            return { kind: "time", ranges, ...transition };
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
            ...(isTransition(c.transition) ? { transition: c.transition } : {}),
        });
    }
    return out;
}
