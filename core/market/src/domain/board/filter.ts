// core/market/domain/board — 종목 조건 술어 레지스트리(순수). 외부 import 0(도메인 값타입만).
// **하나의 조건검색식 언어**를 여러 소비자가 공유한다: 보드 배제 필터(매칭=흐리게/숨김)와 실시간 알람
// (매칭=발화)이 같은 술어·같은 DNF·같은 빌더를 쓴다. 방향(제외 vs 선택)은 소비자가 정하고, 술어는 중립.
//
// **capability 모델**: 술어는 자기가 요구하는 데이터 필드(requires)를 선언하고, 각 소비자는 자기가 가진
// 필드(provides)를 선언한다. requires ⊆ provides 일 때만 그 술어를 쓸 수 있다(availablePredicates).
// ⇒ 어느 보드가 뭘 쓸 수 있나를 손으로 나열할 필요 없음. 데이터 없으면 UI 가 애초에 안 내주고, 방어적
//    test 가 이중으로 막는다(예: buckets 없는 라이브에서 minAmtFew 가 전 종목 오검출하던 버그 원천 봉쇄).
// DNF: 술어를 그룹(AND)으로 묶고 그룹끼리 OR. 그룹이 매칭되면 그 그룹의 mode(dim/hide)로 종목 제외(보드).
import { isNearWindowHigh } from "./trailing.js";
import { AMOUNT_BUCKETS_EOK } from "./amount.js";
import type { ByMarket } from "../candle/model.js";

/** 술어가 요구할 수 있는 데이터 필드(capability 키 = BoardMetrics 키). 소스마다 제공 집합이 다르다. */
export type MetricField = "highPct" | "amount" | "buckets" | "trailingHighs" | "marketCap" | "deltas" | "themeRanks" | "price" | "themeRankMap";

/** 시그널(1분 델타) 원재료 — 창별 등락률(%p)·거래대금 증가(억). 소스가 계산해 배급, 술어가 임계 적용. */
export interface SignalDeltas {
    d30s?: { rate: number; tvEok: number };
    d1m?: { rate: number; tvEok: number };
}

/** 특정 테마×시장에서의 순위(+~60초 전, delta 표시·판정용). themeRankMap 값. */
export interface ThemeRankEntry {
    rank: number;
    past?: number;
}

/** 술어 평가에 필요한 종목 지표(소스가 채워 전달). 선택 필드 = capability(있으면 그 술어 사용 가능). */
export interface BoardMetrics {
    highPct: number; // 고가 등락률(전일비) — 보드의 기준시장 토글 기준 값
    amount: number; // 총 거래대금(원, UN 통합)
    buckets?: number[]; // 분봉 거래대금 구간 카운트(AMOUNT_BUCKETS_EOK 인덱스) — EOD/복기만
    trailingHighs?: ByMarket<number[]>; // 신고가용 high% 배열(0=당일) — newHighFar 의 market 파라미터가 시장을 고름
    marketCap?: number; // 시가총액(억원)
    deltas?: SignalDeltas; // 시그널 델타 — 실시간만
    themeRanks?: ByMarket<number[]>; // 이 종목의 테마별 등락률 순위(시장별) — rank 술어가 min(any-theme) 사용
    price?: number; // 현재가(원) — price 술어(알람)용. 시세 없으면 결손(미결)
    /** 테마명 → 시장별 순위(+60초 전) — themeRank(지정 테마) 술어용. 알람 소스만 배급. */
    themeRankMap?: Record<string, Partial<ByMarket<ThemeRankEntry>>>;
}

/** 파라미터 정의 — UI 입력 렌더용(도메인이 소유 → 술어 추가 시 한 곳만). */
export interface ParamSpec {
    key: string;
    label: string;
    def: number;
    min?: number;
    max?: number; // 있으면 UI 상한(설정값 폭주 방지)
    step?: number;
    /** 있으면 select — 값은 옵션 인덱스(number). 없으면 숫자 입력. */
    options?: string[];
}

/** newHighFar market 파라미터 값 ↔ 시장. 값=옵션 인덱스(0=KRX, 1=UN). 미지정(옛 저장 필터)=UN(기존 동작). */
const MARKET_OPTIONS = ["KRX", "UN"] as const;
function marketOf(p: Record<string, number>): "krx" | "un" {
    return p.market === 0 ? "krx" : "un";
}

/** 문자열 파라미터 정의(테마명 등) — 숫자 params 와 별도 가방(기존 술어·저장 필터 무손상). */
export interface TextParamSpec {
    key: string;
    label: string;
}

/**
 * 술어 정의(레지스트리 항목). test = 매칭 여부(중립: 보드=제외/알람=발화), requires = 필요한 데이터 필드.
 * test3(선택) = 3치 — undefined 는 "데이터 결손이라 판단 불가"(미결). 결손 정책은 소비자가 정한다:
 * 보드 필터·유니버스 탐지 = false 취급 / watchlist 감시 = 틱 스킵(가짜 엣지 방지). 미구현 술어는
 * requires 필드 존재 검사(evalPredicate)가 결손을 대신 판정한다.
 */
export interface BoardPredicateDef {
    kind: string;
    title: string;
    requires: MetricField[];
    params: ParamSpec[];
    textParams?: TextParamSpec[];
    test: (m: BoardMetrics, p: Record<string, number>, t?: Record<string, string>) => boolean;
    /** 필드 존재만으론 결손을 못 가리는 술어(테마별 순위 등)의 3치 판정. */
    test3?: (m: BoardMetrics, p: Record<string, number>, t?: Record<string, string>) => boolean | undefined;
    label: (p: Record<string, number>, t?: Record<string, string>) => string;
    /** 매칭 근거 문구(실측값 포함) — 알람 발화의 "왜 걸렸나". 생략 시 label 폴백(predicateEvidence). */
    evidence?: (m: BoardMetrics, p: Record<string, number>, t?: Record<string, string>) => string;
}

/**
 * 술어 3치 평가 — 정본 진입점. requires 필드가 하나라도 결손이면 undefined(미결), 아니면 test3 ?? test.
 * 소비자별 결손 정책: 보드 필터(groupMatches)·유니버스 탐지 = undefined→false / watchlist = 틱 스킵.
 */
export function evalPredicate(def: BoardPredicateDef, m: BoardMetrics, pi: BoardPredicateInstance): boolean | undefined {
    for (const f of def.requires) if (m[f] == null) return undefined;
    return def.test3 ? def.test3(m, pi.params, pi.textParams) : def.test(m, pi.params, pi.textParams);
}

/** 매칭된 술어의 근거 문구 — 술어가 자신을 설명한다(로직은 core 한 곳, 소비자는 렌더만). */
export function predicateEvidence(def: BoardPredicateDef, m: BoardMetrics, pi: BoardPredicateInstance): string {
    return def.evidence?.(m, pi.params, pi.textParams) ?? def.label(pi.params, pi.textParams);
}

/** ≥eok억 분봉 횟수 — buckets 하한이 eok 이상인 구간 카운트 합(고정 구간이라 경계값에서 정확). */
function countAtLeastEok(buckets: number[] | undefined, eok: number): number {
    if (!buckets) return 0;
    let n = 0;
    for (let i = 0; i < AMOUNT_BUCKETS_EOK.length; i++) if (AMOUNT_BUCKETS_EOK[i] >= eok) n += buckets[i] ?? 0;
    return n;
}

// ── 술어 레지스트리 — 추가/변경은 여기 한 곳. test 는 중립(매칭 여부만), 방향은 소비자·파라미터가 정한다. ──
export const BOARD_PREDICATES: BoardPredicateDef[] = [
    {
        kind: "newHighFar",
        title: "매물대",
        requires: ["trailingHighs"],
        params: [
            { key: "market", label: "시장", def: 1, options: [...MARKET_OPTIONS] },
            { key: "window", label: "거래일", def: 20, min: 1 },
            { key: "tol", label: "허용 갭%", def: 2, min: 0, step: 0.5 },
            // 방향 파라미터 = 부등호 연산자. `N일 고가% − tol [op] 당일 고가%`:
            //   내부(>) = 당일이 창최고보다 tol 넘게 아래(매물대 안) / 돌파(≤) = 당일이 창최고 tol 이내(근접).
            // 경계값은 돌파(코드: max−today ≤ tol). 값=인덱스(0/1)라 라벨만 바꿔도 저장 필터 무손상. 미지정=내부.
            { key: "side", label: "위치", def: 0, options: [">", "≤"] },
        ],
        // 한 그룹에 KRX·UN 두 인스턴스를 AND 로 넣으면 "둘 다"(예: 둘 다 매물대 내부여야 흐리게).
        test: (m, p) => {
            const highs = m.trailingHighs?.[marketOf(p)];
            if (!highs) return false;
            const near = isNearWindowHigh(highs, p.window, p.tol); // near = 창최고 근접 = 돌파
            return (p.side ?? 0) === 1 ? near : !near;
        },
        label: (p) => `${p.window ?? 20}일 고가% − ${p.tol ?? 2}% ${(p.side ?? 0) === 1 ? "≤" : ">"} 당일 고가%(${MARKET_OPTIONS[p.market === 0 ? 0 : 1]})`,
    },
    {
        kind: "minAmtFew",
        title: "분봉 대금",
        requires: ["buckets"],
        params: [
            { key: "eok", label: "억", def: 50, min: 1 },
            { key: "maxCount", label: "회 이하", def: 0, min: 0 },
        ],
        // buckets 없으면 false(매칭 안 함) — 라이브 등 분봉 결손 소스에서 전 종목 오검출 방지(capability 와 이중 방어).
        test: (m, p) => m.buckets != null && countAtLeastEok(m.buckets, p.eok) <= p.maxCount,
        label: () => "분봉 대금",
    },
    {
        kind: "smallAmount",
        title: "일봉 대금",
        requires: ["amount"],
        params: [{ key: "ltEok", label: "억 미만", def: 100, min: 1 }],
        test: (m, p) => m.amount / 1e8 < p.ltEok,
        label: () => "일봉 대금",
    },
    {
        kind: "weakHigh",
        title: "고가 등락률",
        requires: ["highPct"],
        params: [{ key: "ltPct", label: "% 미만", def: 10, min: 0, step: 0.5 }],
        test: (m, p) => m.highPct < p.ltPct,
        label: () => "고가 등락률",
    },
    // ── 실시간 전용 술어(deltas·themeRanks·marketCap 요구) — 알람·실시간 보드에서 소스가 배선한 만큼 열림 ──
    {
        kind: "signal",
        title: "시그널(돈유입)",
        requires: ["deltas"],
        params: [
            { key: "window", label: "창", def: 0, options: ["30초", "1분"] },
            { key: "rateMin", label: "%p↑", def: 0.4, min: 0, max: 30, step: 0.1 },
            { key: "tvMin", label: "억↑", def: 40, min: 0, max: 100_000, step: 10 },
        ],
        test: (m, p) => {
            const d = p.window === 1 ? m.deltas?.d1m : m.deltas?.d30s;
            return d != null && d.rate >= p.rateMin && d.tvEok >= p.tvMin;
        },
        label: (p) => `${p.window === 1 ? "1분" : "30초"} 시그널`,
        evidence: (m, p) => {
            const d = p.window === 1 ? m.deltas?.d1m : m.deltas?.d30s;
            if (!d) return `${p.window === 1 ? "1분" : "30초"} 시그널`;
            return `${p.window === 1 ? "1분" : "30초"} 시그널 (+${d.rate.toFixed(1)}%p · ${Math.round(d.tvEok).toLocaleString("ko-KR")}억)`;
        },
    },
    {
        kind: "marketCap",
        title: "시가총액",
        requires: ["marketCap"],
        params: [{ key: "lteEok", label: "억 이하", def: 5_000, min: 0, step: 100 }],
        test: (m, p) => m.marketCap != null && m.marketCap <= p.lteEok,
        label: (p) => `시총 ${p.lteEok.toLocaleString("ko-KR")}억 이하`,
        evidence: (m, p) => `시총 ${(m.marketCap ?? 0).toLocaleString("ko-KR")}억 (≤ ${p.lteEok.toLocaleString("ko-KR")}억)`,
    },
    {
        kind: "rank",
        title: "테마 순위",
        requires: ["themeRanks"],
        params: [
            { key: "market", label: "시장", def: 1, options: [...MARKET_OPTIONS] },
            { key: "threshold", label: "위 이내", def: 3, min: 1 },
        ],
        // any-theme reach — 그 종목이 속한 테마 중 하나라도 threshold 위 이내면 매칭("지금 어느 테마의 대장").
        test: (m, p) => {
            const ranks = m.themeRanks?.[marketOf(p)];
            return ranks != null && ranks.length > 0 && Math.min(...ranks) <= p.threshold;
        },
        label: (p) => `테마 ${p.threshold}위 이내(${MARKET_OPTIONS[p.market === 0 ? 0 : 1]})`,
        evidence: (m, p) => {
            const ranks = m.themeRanks?.[marketOf(p)];
            const best = ranks && ranks.length > 0 ? Math.min(...ranks) : null;
            return `테마 ${best ?? "?"}위 (${p.threshold}위 이내·${MARKET_OPTIONS[p.market === 0 ? 0 : 1]})`;
        },
    },
    // ── watchlist(집중 감시) 이관 술어 — 옛 AlertLeaf(price/rank) 대체. 알람 소스만 배급(capability). ──
    {
        kind: "price",
        title: "가격",
        requires: ["price"],
        params: [
            { key: "op", label: "방향", def: 0, options: ["≥", "≤"] },
            { key: "value", label: "원", def: 0, min: 1 },
        ],
        // 시세 결손은 requires 존재 검사(evalPredicate)가 미결로 — 옛 "quote 없으면 스킵" 의미 보존.
        test: (m, p) => (m.price != null ? (p.op === 1 ? m.price <= p.value : m.price >= p.value) : false),
        label: (p) => `가격 ${p.op === 1 ? "≤" : "≥"} ${p.value.toLocaleString("ko-KR")}원`,
        evidence: (m, p) => `${(m.price ?? 0).toLocaleString("ko-KR")}원 ${p.op === 1 ? "≤" : "≥"} ${p.value.toLocaleString("ko-KR")}원`,
    },
    {
        kind: "themeRank",
        title: "테마 순위(지정)",
        requires: ["themeRankMap"],
        params: [
            { key: "market", label: "시장", def: 1, options: [...MARKET_OPTIONS] },
            { key: "mode", label: "방식", def: 0, options: ["도달", "상승"] },
            { key: "threshold", label: "K/D", def: 3, min: 1 },
        ],
        textParams: [{ key: "theme", label: "테마" }],
        test: (m, p, t) => testThemeRank(m, p, t) === true,
        // 3치 — 지정 테마의 순위 미도착(전일종가·멤버십) / 상승 모드의 60초 이력 미적립 = 미결.
        test3: testThemeRank,
        label: (p, t) => `${t?.theme ?? "테마"} ${p.mode === 1 ? `${p.threshold}계단↑` : `${p.threshold}위 이내`}(${MARKET_OPTIONS[p.market === 0 ? 0 : 1]})`,
        evidence: (m, p, t) => {
            const e = t?.theme ? m.themeRankMap?.[t.theme]?.[marketOf(p)] : undefined;
            if (!e) return `${t?.theme ?? "테마"} 순위`;
            const move = e.past == null ? `${e.rank}위` : e.past === e.rank ? `${e.rank}위 유지` : `${e.past}위→${e.rank}위`;
            const cond = p.mode === 1 ? `${p.threshold}계단↑` : `${p.threshold}위 이내`;
            return `${t?.theme} ${MARKET_OPTIONS[p.market === 0 ? 0 : 1]} ${move} (${cond})`;
        },
    },
];

/** themeRank 3치 본체 — reach 판정은 현재 순위만(past 는 표시용), delta 는 past 필수(없으면 미결). */
function testThemeRank(m: BoardMetrics, p: Record<string, number>, t?: Record<string, string>): boolean | undefined {
    const theme = t?.theme;
    if (!theme) return false; // 테마 미지정 = 작성 오류 — 불성립(미결 아님: 데이터가 아니라 식의 문제)
    const e = m.themeRankMap?.[theme]?.[marketOf(p)];
    if (!e) return undefined; // 순위 미도착(전일종가·멤버십 로드 전) — 미결
    if (p.mode !== 1) return e.rank <= p.threshold;
    if (e.past == null) return undefined; // 60초 이력 미적립 — 미결
    return e.past - e.rank >= p.threshold; // 양수 = 순위 상승
}

export function boardPredicateDef(kind: string): BoardPredicateDef | undefined {
    return BOARD_PREDICATES.find((d) => d.kind === kind);
}

/** 기본 파라미터 — 술어 추가 시 params.def 로 채운다. */
export function defaultParams(kind: string): Record<string, number> {
    const out: Record<string, number> = {};
    const def = boardPredicateDef(kind);
    if (def) for (const p of def.params) out[p.key] = p.def;
    return out;
}

// ── capability — 소스가 제공하는 필드로 사용 가능 술어를 거른다(하드코딩 목록 대체). ──
/** 그 소스(provides)에서 이 술어를 쓸 수 있나 — 요구 필드를 전부 제공하면 가능. */
export function predicateAvailable(def: BoardPredicateDef, provides: ReadonlySet<MetricField>): boolean {
    return def.requires.every((f) => provides.has(f));
}
/** 그 소스에서 쓸 수 있는 술어들(UI 팔레트). */
export function availablePredicates(provides: ReadonlySet<MetricField>): BoardPredicateDef[] {
    return BOARD_PREDICATES.filter((d) => predicateAvailable(d, provides));
}
/** EOD/복기 소스 제공 필드(DB — 분봉 buckets 있음, 실시간 델타·순위 없음). */
export const EOD_FIELDS: ReadonlySet<MetricField> = new Set(["highPct", "amount", "buckets", "trailingHighs"]);
/** 실시간 보드 소스 제공 필드(REST 스냅샷 — deltas·ranks 원재료 배급으로 buckets 빼고 전부). */
export const LIVE_FIELDS: ReadonlySet<MetricField> = new Set(["highPct", "amount", "trailingHighs", "marketCap", "deltas", "themeRanks"]);
/** 알람 소스 제공 필드(live 서버 metrics 빌더 — buckets 빼고 전부 + price·지정테마 순위). 규칙 검증·빌더 팔레트가 사용. */
export const LIVE_ALARM_FIELDS: ReadonlySet<MetricField> = new Set(["highPct", "amount", "trailingHighs", "marketCap", "deltas", "themeRanks", "price", "themeRankMap"]);

// ── 필터식(DNF, 그룹별 mode) ──
/** dim/hide = 배제(흐리게/숨김) / mark = 강조(🔥 — 돈유입 등 "눈에 띄게"는 배제의 반대 방향). */
export type BoardFilterMode = "dim" | "hide" | "mark";
export interface BoardPredicateInstance {
    kind: string;
    params: Record<string, number>;
    /** 문자열 파라미터(테마명 등) — 숫자와 별도 가방(기존 저장 필터 무손상). */
    textParams?: Record<string, string>;
}
export interface BoardFilterGroup {
    predicates: BoardPredicateInstance[];
    mode: BoardFilterMode; // 이 그룹에 매칭된 종목 처리(그룹별 개별)
}
export interface BoardFilterExpr {
    groups: BoardFilterGroup[];
}

/** 그룹 매칭 = 비어있지 않고 술어 전부 참(AND). 보드 소비자의 결손 정책 = false(미결이면 제외 안 함). */
export function groupMatches(g: BoardFilterGroup, m: BoardMetrics): boolean {
    return (
        g.predicates.length > 0 &&
        g.predicates.every((pi) => {
            const def = boardPredicateDef(pi.kind);
            return def ? evalPredicate(def, m, pi) === true : false;
        })
    );
}

export interface BoardFilterVerdict {
    effect: "show" | "dim" | "hide";
    /** mark 그룹 매칭 — 배제와 직교(🔥 이면서 다른 그룹으로 dim 일 수 있다. hide 면 행이 없어 무의미). */
    marked: boolean;
    reasons: string[]; // 매칭된 배제(dim/hide) 그룹 술어 라벨(제외 사유 태그)
    markReasons: string[]; // 매칭된 mark 그룹 술어 라벨(🔥 툴팁)
}

/** 종목 판정 — 배제: hide 우선 > dim > show. 강조(mark)는 별도 축. reasons/markReasons = 매칭 술어 라벨(dedup). */
export function evalBoardFilter(expr: BoardFilterExpr, m: BoardMetrics): BoardFilterVerdict {
    let effect: "show" | "dim" | "hide" = "show";
    let marked = false;
    const reasons: string[] = [];
    const markReasons: string[] = [];
    for (const g of expr.groups) {
        if (!groupMatches(g, m)) continue;
        if (g.mode === "mark") marked = true;
        else if (g.mode === "hide") effect = "hide";
        else if (effect !== "hide") effect = "dim";
        for (const pi of g.predicates) {
            const def = boardPredicateDef(pi.kind);
            if (def) (g.mode === "mark" ? markReasons : reasons).push(def.label(pi.params, pi.textParams));
        }
    }
    return { effect, marked, reasons: [...new Set(reasons)], markReasons: [...new Set(markReasons)] };
}

/** 활성(비어있지 않은 그룹) 여부. */
export function isBoardFilterActive(expr: BoardFilterExpr): boolean {
    return expr.groups.some((g) => g.predicates.length > 0);
}
