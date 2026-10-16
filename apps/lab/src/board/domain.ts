// 테마 보드 순수 계산 — tdm-work core/market/src/domain 에서 보드가 쓰는 것만 옮겨 왔다(외부 import 0).
//   board/ranking.ts(유니버스) · board/roster.ts(테마 로스터·포함관계·관련 테마) · board/grouping.ts(카드 묶기)
//   board/signals.ts(주도주·1분 신호) · replay/dayReplay.ts(rebasePct) · replay/rankSection.ts(lastIndexAtOrBefore)
import type { ReplayStock } from "../market/types.js";

// ── 시점 스냅샷 ───────────────────────────────────────────────

/** times 에서 t 이하 마지막 인덱스(이진탐색). 없으면 -1. */
export function lastIndexAtOrBefore(times: readonly number[], t: number): number {
    let lo = 0;
    let hi = times.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

export interface Snapshot {
    code: string;
    rate: number; // t 종가 등락률 %
    openPct: number; // 당일 시가 %
    highPct: number; // t 까지 고가 %
    lowPct: number; // t 까지 저가 %
    cumAmount: number; // t 까지 누적 거래대금(원)
}

/** 시점 t 의 스냅샷 — t 이하 마지막 분의 값(그 시각까지의 정보만). t 이전 데이터가 없으면 null(아직 미개장). */
export function snapshotAt(s: Pick<ReplayStock, "code" | "times" | "rate" | "open" | "high" | "low" | "cumAmount">, t: number): Snapshot | null {
    const i = lastIndexAtOrBefore(s.times, t);
    if (i < 0) return null;
    return { code: s.code, rate: s.rate[i], openPct: s.open, highPct: s.high[i], lowPct: s.low[i], cumAmount: s.cumAmount[i] };
}

/** % 재기저 — fromBase 대비 % 를 toBase 대비 % 로(같은 가격). 통합(UN) % 를 KRX 기준으로 바꿀 때. 소수 2자리. */
export function rebasePct(pct: number, fromBase: number, toBase: number): number {
    return Math.round(((fromBase * (100 + pct)) / toBase - 100) * 100) / 100;
}

// ── 유니버스 ─────────────────────────────────────────────────

/** 거래대금 상위 amountN ∪ 등락률 상위 rateN — 그 시점 주목 종목 집합. */
export function selectHotUniverse<T extends { code: string; changeRate: number; amount: number }>(stocks: readonly T[], amountN: number, rateN: number): Set<string> {
    const topA = Math.max(0, Math.floor(amountN || 0));
    const topR = Math.max(0, Math.floor(rateN || 0));
    const hot = new Set<string>();
    for (const s of [...stocks].sort((a, b) => b.amount - a.amount).slice(0, topA)) hot.add(s.code);
    for (const s of [...stocks].sort((a, b) => b.changeRate - a.changeRate).slice(0, topR)) hot.add(s.code);
    return hot;
}

// ── 주도주 · 1분 신호 ─────────────────────────────────────────

/** 시총 구간별 "이 등락률을 넘어야 주도주". minCap 큰 순 첫 매칭(억원 / %). */
const SUMMARIZE_TIERS: { minCapEok: number; maxRate: number }[] = [
    { minCapEok: 50_000, maxRate: 3 }, // 시총 5조 이상 → 3% 초과
    { minCapEok: 0, maxRate: 5 }, // 5조 미만 → 5% 초과
];

/** 주도주 = 등락률이 시총별 임계 초과. 시총 미상이면 5% 기준. */
export function isMover(marketCapEok: number | null, changeRate: number): boolean {
    const cap = marketCapEok ?? 0;
    const tier = SUMMARIZE_TIERS.find((t) => cap >= t.minCapEok) ?? SUMMARIZE_TIERS[SUMMARIZE_TIERS.length - 1];
    return changeRate > tier.maxRate;
}

export interface DeltaHit {
    label: string;
    rateDelta: number; // %p
    tvDelta: number; // 원(최근 1분 거래대금)
}

/** 1분 신호 — 1분 사이 등락률 +0.6%p 이상이면서 거래대금 60억 이상. */
export function evaluateSignal(rateDelta: number, tvDeltaKrw: number): DeltaHit | null {
    return rateDelta >= 0.6 && tvDeltaKrw >= 6_000_000_000 ? { label: "1분", rateDelta, tvDelta: tvDeltaKrw } : null;
}

// ── 테마 로스터 · 포함관계 · 관련 테마 ─────────────────────────

/** 테마 → 그 테마 멤버(등락률 높은 순). 한 종목이 여러 테마에 든다. */
export function stocksByTheme<T extends { themes: string[]; changeRate: number }>(stocks: T[]): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const s of stocks)
        for (const t of s.themes) {
            const list = m.get(t);
            if (list) list.push(s);
            else m.set(t, [s]);
        }
    for (const list of m.values()) list.sort((a, b) => b.changeRate - a.changeRate);
    return m;
}

/** 포함관계 — 테마 → 그 테마의 멤버를 전부 포함하는 더 큰 테마들(멤버 많은 순). 시점에 따라 바뀐다. */
export function themeParents<T extends { code: string }>(byTheme: Map<string, T[]>): Map<string, string[]> {
    const codes = new Map<string, Set<string>>();
    for (const [t, list] of byTheme) codes.set(t, new Set(list.map((s) => s.code)));
    const out = new Map<string, string[]>();
    for (const [t, tc] of codes) {
        if (tc.size === 0) continue;
        const parents: string[] = [];
        for (const [p, pc] of codes) {
            if (p === t || pc.size <= tc.size) continue;
            let sub = true;
            for (const c of tc)
                if (!pc.has(c)) {
                    sub = false;
                    break;
                }
            if (sub) parents.push(p);
        }
        if (parents.length) out.set(t, parents.sort((a, b) => codes.get(b)!.size - codes.get(a)!.size));
    }
    return out;
}

export type RelationKind = "parent" | "child" | "overlap";

/** 한 카드의 관련 테마 — 멤버들이 걸친 다른 ≥2 멤버 테마 + 관계(포함됨·포함함·겹침). parent → child → overlap 순. */
export function relatedThemes<T extends { themes: string[] }>(
    home: string,
    homeStocks: readonly T[],
    byTheme: Map<string, unknown[]>,
    parents: Map<string, string[]>,
): { theme: string; kind: RelationKind }[] {
    const myParents = parents.get(home) ?? [];
    const seen = new Set<string>();
    const out: { theme: string; kind: RelationKind }[] = [];
    for (const s of homeStocks)
        for (const t of s.themes) {
            if (t === home || seen.has(t)) continue;
            if ((byTheme.get(t)?.length ?? 0) < 2) continue;
            seen.add(t);
            const kind: RelationKind = myParents.includes(t) ? "parent" : (parents.get(t) ?? []).includes(home) ? "child" : "overlap";
            out.push({ theme: t, kind });
        }
    const rank: Record<RelationKind, number> = { parent: 0, child: 1, overlap: 2 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

// ── 카드 묶기 ───────────────────────────────────────────────

export interface Groupable {
    code: string;
    themes: string[];
    changeRate: number;
    isMover: boolean;
    amount: number;
}

export interface ThemeGroup<T> {
    theme: string;
    stocks: T[]; // 등락률 높은 순
}

export interface Grouped<T> {
    themes: ThemeGroup<T>[]; // 멤버 2개 이상 테마(카드), 정렬순
    individuals: T[]; // 어느 카드에도 못 든 종목(테마 있음)
    unclassified: T[]; // 테마 없음
}

const sumAmount = <T extends Groupable>(s: T[]): number => s.reduce((n, x) => n + x.amount, 0);
const moverCount = <T extends Groupable>(g: ThemeGroup<T>): number => g.stocks.filter((s) => s.isMover).length;

/** 카드 순서 — 주도주 수 → 멤버 수 → 거래대금 합 → 이름. */
export function themeCompare<T extends Groupable>(a: ThemeGroup<T>, b: ThemeGroup<T>): number {
    return moverCount(b) - moverCount(a) || b.stocks.length - a.stocks.length || sumAmount(b.stocks) - sumAmount(a.stocks) || a.theme.localeCompare(b.theme, "ko");
}

/** 멤버 2개 이상 테마 = 카드(한 종목이 여러 카드에 중복 가능). 나머지는 개별(테마 있음) / 미분류(테마 없음). */
export function groupStocks<T extends Groupable>(byTheme: Map<string, T[]>, all: readonly T[]): Grouped<T> {
    const themes: ThemeGroup<T>[] = [];
    for (const [theme, list] of byTheme) if (list.length >= 2) themes.push({ theme, stocks: list });
    themes.sort(themeCompare);
    const carded = new Set<string>();
    for (const g of themes) for (const s of g.stocks) carded.add(s.code);
    const individuals: T[] = [];
    const unclassified: T[] = [];
    for (const s of all) {
        if (carded.has(s.code)) continue;
        (s.themes.length > 0 ? individuals : unclassified).push(s);
    }
    individuals.sort((a, b) => b.changeRate - a.changeRate);
    unclassified.sort((a, b) => b.changeRate - a.changeRate);
    return { themes, individuals, unclassified };
}
