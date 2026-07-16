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

/** 술어가 요구할 수 있는 데이터 필드(capability 키). 소스마다 제공 집합이 다르다. */
export type MetricField = "highPct" | "amount" | "buckets" | "trailingHighs" | "marketCap" | "deltas" | "themeRanks";

/** 시그널(1분 델타) 원재료 — 창별 등락률(%p)·거래대금 증가(억). 소스가 계산해 배급, 술어가 임계 적용. */
export interface SignalDeltas {
    d30s?: { rate: number; tvEok: number };
    d1m?: { rate: number; tvEok: number };
}

/** 술어 평가에 필요한 종목 지표(소스가 채워 전달). 선택 필드 = capability(있으면 그 술어 사용 가능). */
export interface BoardMetrics {
    highPct: number; // 고가 등락률(전일비) — 보드의 기준시장 토글 기준 값
    amount: number; // 총 거래대금(원, UN 통합)
    buckets?: number[]; // 분봉 거래대금 구간 카운트(AMOUNT_BUCKETS_EOK 인덱스) — EOD/복기만
    trailingHighs?: ByMarket<number[]>; // 신고가용 high% 배열(0=당일) — newHighFar 의 market 파라미터가 시장을 고름
    marketCap?: number; // 시가총액(억원)
    deltas?: SignalDeltas; // 시그널 델타 — 실시간만
    ranks?: ByMarket<number[]>; // 이 종목의 테마별 등락률 순위(시장별) — 실시간만. rank 술어가 min(any-theme) 사용
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

/** 술어 정의(레지스트리 항목). test = 매칭 여부(중립: 보드=제외/알람=발화), requires = 필요한 데이터 필드. */
export interface BoardPredicateDef {
    kind: string;
    title: string;
    requires: MetricField[];
    params: ParamSpec[];
    test: (m: BoardMetrics, p: Record<string, number>) => boolean;
    label: (p: Record<string, number>) => string;
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
            // 방향 파라미터 — 내부(창최고 아래=매물대 안)/돌파(창최고 근접). 미지정=내부(기존 보드 동작).
            { key: "side", label: "위치", def: 0, options: ["내부", "돌파"] },
        ],
        // 한 그룹에 KRX·UN 두 인스턴스를 AND 로 넣으면 "둘 다"(예: 둘 다 매물대 내부여야 흐리게).
        test: (m, p) => {
            const highs = m.trailingHighs?.[marketOf(p)];
            if (!highs) return false;
            const near = isNearWindowHigh(highs, p.window, p.tol); // near = 창최고 근접 = 돌파
            return (p.side ?? 0) === 1 ? near : !near;
        },
        label: (p) => `매물대 ${(p.side ?? 0) === 1 ? "돌파" : "내부"}(${MARKET_OPTIONS[p.market === 0 ? 0 : 1]})`,
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
    },
    {
        kind: "marketCap",
        title: "시가총액",
        requires: ["marketCap"],
        params: [{ key: "lteEok", label: "억 이하", def: 5_000, min: 0, step: 100 }],
        test: (m, p) => m.marketCap != null && m.marketCap <= p.lteEok,
        label: (p) => `시총 ${p.lteEok.toLocaleString("ko-KR")}억 이하`,
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
            const ranks = m.ranks?.[marketOf(p)];
            return ranks != null && ranks.length > 0 && Math.min(...ranks) <= p.threshold;
        },
        label: (p) => `테마 ${p.threshold}위 이내(${MARKET_OPTIONS[p.market === 0 ? 0 : 1]})`,
    },
];

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
/** 실시간 보드 소스 제공 필드(REST — 현재 배선분. deltas·marketCap·themeRanks 는 조각 3에서 확장). */
export const LIVE_FIELDS: ReadonlySet<MetricField> = new Set(["highPct", "amount", "trailingHighs"]);

// ── 필터식(DNF, 그룹별 mode) ──
export type BoardFilterMode = "dim" | "hide";
export interface BoardPredicateInstance {
    kind: string;
    params: Record<string, number>;
}
export interface BoardFilterGroup {
    predicates: BoardPredicateInstance[];
    mode: BoardFilterMode; // 이 그룹에 매칭된 종목을 흐리게/숨김(그룹별 개별)
}
export interface BoardFilterExpr {
    groups: BoardFilterGroup[];
}

function testPredicate(pi: BoardPredicateInstance, m: BoardMetrics): boolean {
    const def = boardPredicateDef(pi.kind);
    return def ? def.test(m, pi.params) : false;
}

/** 그룹 매칭 = 비어있지 않고 술어 전부 참(AND). */
export function groupMatches(g: BoardFilterGroup, m: BoardMetrics): boolean {
    return g.predicates.length > 0 && g.predicates.every((pi) => testPredicate(pi, m));
}

export interface BoardFilterVerdict {
    effect: "show" | "dim" | "hide";
    reasons: string[]; // 매칭된 그룹 술어 라벨(제외 사유 태그)
}

/** 종목 판정 — 매칭 그룹 중 hide 있으면 hide(우선), 없으면 dim, 매칭 없으면 show. reasons = 매칭 술어 라벨(dedup). */
export function evalBoardFilter(expr: BoardFilterExpr, m: BoardMetrics): BoardFilterVerdict {
    let effect: "show" | "dim" | "hide" = "show";
    const reasons: string[] = [];
    for (const g of expr.groups) {
        if (!groupMatches(g, m)) continue;
        if (g.mode === "hide") effect = "hide";
        else if (effect !== "hide") effect = "dim";
        for (const pi of g.predicates) {
            const def = boardPredicateDef(pi.kind);
            if (def) reasons.push(def.label(pi.params));
        }
    }
    return { effect, reasons: [...new Set(reasons)] };
}

/** 활성(비어있지 않은 그룹) 여부. */
export function isBoardFilterActive(expr: BoardFilterExpr): boolean {
    return expr.groups.some((g) => g.predicates.length > 0);
}
