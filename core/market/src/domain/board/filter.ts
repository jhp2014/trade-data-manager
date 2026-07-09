// core/market/domain/board — 이슈보드 배제 필터(순수). 술어(predicate) 레지스트리 = 한 곳에 모아 관리·확장.
// DNF: 술어를 그룹(AND)으로 묶고 그룹끼리 OR. 그룹이 매칭되면 그 그룹의 mode(dim/hide)로 종목 제외.
// **새 술어 추가 = BOARD_PREDICATES 에 한 항목(test·label·params)만.** UI 는 이 정의(params)로 입력을 렌더한다.
import { isNearWindowHigh } from "./trailing.js";
import { AMOUNT_BUCKETS_EOK } from "./amount.js";

/** 술어 평가에 필요한 종목 지표(보드가 채워 전달). */
export interface BoardMetrics {
    highPct: number; // 고가 등락률(전일비)
    amount: number; // 총 거래대금(원)
    buckets?: number[]; // 분봉 거래대금 구간 카운트(AMOUNT_BUCKETS_EOK 인덱스)
    trailingHighs?: number[]; // 신고가용 high% 배열(0=당일)
}

/** 파라미터 정의 — UI 입력 렌더용(도메인이 소유 → 술어 추가 시 한 곳만). */
export interface ParamSpec {
    key: string;
    label: string;
    def: number;
    min?: number;
    step?: number;
}

/** 술어 정의(레지스트리 항목). test = 매칭(=제외) 여부, label = 사유 태그/빌더 표시. */
export interface BoardPredicateDef {
    kind: string;
    title: string;
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

// ── 술어 레지스트리 — 추가/변경은 여기 한 곳. 전부 "매칭 = 제외" 방향(부정문). ──
export const BOARD_PREDICATES: BoardPredicateDef[] = [
    {
        kind: "newHighFar",
        title: "매물대 내부",
        params: [
            { key: "window", label: "거래일", def: 20, min: 1 },
            { key: "tol", label: "허용 갭%", def: 2, min: 0, step: 0.5 },
        ],
        test: (m, p) => (m.trailingHighs ? !isNearWindowHigh(m.trailingHighs, p.window, p.tol) : false),
        label: () => "매물대 내부",
    },
    {
        kind: "minAmtFew",
        title: "분봉 대금",
        params: [
            { key: "eok", label: "억", def: 50, min: 1 },
            { key: "maxCount", label: "회 이하", def: 0, min: 0 },
        ],
        test: (m, p) => countAtLeastEok(m.buckets, p.eok) <= p.maxCount,
        label: () => "분봉 대금",
    },
    {
        kind: "smallAmount",
        title: "일봉 대금",
        params: [{ key: "ltEok", label: "억 미만", def: 100, min: 1 }],
        test: (m, p) => m.amount / 1e8 < p.ltEok,
        label: () => "일봉 대금",
    },
    {
        kind: "weakHigh",
        title: "고가 등락률",
        params: [{ key: "ltPct", label: "% 미만", def: 10, min: 0, step: 0.5 }],
        test: (m, p) => m.highPct < p.ltPct,
        label: () => "고가 등락률",
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
