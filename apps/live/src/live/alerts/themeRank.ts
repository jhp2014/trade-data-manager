// 테마 내 등락률 순위(themeRank) — 이번 틱 유니버스(hot∪watchlist) 시세에서 계산. 순수.
// 등락률 = (현재가 − market 전일종가)/전일종가. 이중-시장이라 KRX/UN 두 벌을 각각 매긴다
//   (같은 종목·테마라도 시장별 전일종가가 달라 %·순위가 갈림 — 보드 표시 %와 같은 잣대).
// 키 = `code|theme|market`. 전일종가 미도착(핫 편입 직후)인 (code,market)은 그 시장 순위에서 빠진다.
// 순위 델타(60s 창)는 RankTracker 가 이력으로 제공(signals 의 링버퍼 델타와 동일 창·stale 규칙).
import type { Quote } from "../engine/types.js";
import type { AlertMarket } from "./types.js";

const WINDOW_MS = 60_000; // 델타 비교 창(1분)
const KEEP_MS = 70_000; // 보관 창 — 60s-과거 틱이 안정적으로 남게 여유
const MARKETS: readonly AlertMarket[] = ["krx", "un"];

/** (code,theme,market) → rank 키. RankTracker 와 공유. */
export function rankKey(code: string, theme: string, market: AlertMarket): string {
    return `${code}|${theme}|${market}`;
}

/** market 전일종가 조회 — 없으면 undefined(그 시장 순위에서 제외). */
export type PrevCloseLookup = (code: string, market: AlertMarket) => number | undefined;

/**
 * code|theme|market → 1-based 등락률 순위(1=테마 내 그 시장 최강). 각 (theme,market) 그룹을
 * 등락률 내림차순 정렬 후 순번. 동률은 거래대금↓·코드↑로 결정(틱 간 안정 = 델타 진동 억제).
 */
export function computeThemeRanks(
    quotes: Iterable<Quote>,
    themesOf: (code: string) => string[],
    prevCloseOf: PrevCloseLookup,
): Map<string, number> {
    // 그룹 키 = `theme|market` → 멤버{code, rate, tv}
    const groups = new Map<string, { code: string; rate: number; tv: number }[]>();
    for (const q of quotes) {
        for (const theme of themesOf(q.code)) {
            for (const market of MARKETS) {
                const base = prevCloseOf(q.code, market);
                if (base == null || !(base > 0)) continue; // 그 시장 전일종가 없음 → 제외
                const rate = (q.price / base - 1) * 100;
                const gk = `${theme}|${market}`;
                const list = groups.get(gk);
                if (list) list.push({ code: q.code, rate, tv: q.tradeValue });
                else groups.set(gk, [{ code: q.code, rate, tv: q.tradeValue }]);
            }
        }
    }
    const out = new Map<string, number>();
    for (const [gk, members] of groups) {
        members.sort((a, b) => b.rate - a.rate || b.tv - a.tv || (a.code < b.code ? -1 : 1));
        members.forEach((m, i) => out.set(`${m.code}|${gk}`, i + 1));
    }
    return out;
}

/** (code,theme,market)별 순위 이력 — 순위 룰 delta(창 내 상승 계단) 계산용. 키 = rankKey. */
export class RankTracker {
    private hist = new Map<string, Array<{ ts: number; rank: number }>>();

    /** 이번 틱 순위(computeThemeRanks 결과)를 이력에 적재 + 창 밖 프루닝. 유니버스에서 빠진 키는 이력이 말라 자연 소멸. */
    push(ranks: Map<string, number>, now: number): void {
        for (const [key, rank] of ranks) {
            const h = this.hist.get(key) ?? [];
            h.push({ ts: now, rank });
            while (h.length && h[0].ts < now - KEEP_MS) h.shift();
            this.hist.set(key, h);
        }
        // 이번 틱에 안 실린 키의 옛 이력 프루닝(맵 누수 방지)
        for (const [key, h] of this.hist) {
            while (h.length && h[0].ts < now - KEEP_MS) h.shift();
            if (h.length === 0) this.hist.delete(key);
        }
    }

    /** ~60초 전 순위. 그런 틱이 없거나 갭 너머 stale(>2×창)이면 undefined → 비교 거부(signals 와 동일 규칙). */
    rankAgo(key: string, now: number): number | undefined {
        const h = this.hist.get(key);
        if (!h) return undefined;
        const target = now - WINDOW_MS;
        for (let i = h.length - 1; i >= 0; i--) {
            if (h[i].ts <= target) return now - h[i].ts > WINDOW_MS * 2 ? undefined : h[i].rank;
        }
        return undefined; // 아직 60초치 이력이 안 쌓임
    }
}
