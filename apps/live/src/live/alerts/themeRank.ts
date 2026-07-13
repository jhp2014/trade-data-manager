// 테마 내 거래대금 순위(themeRank) — 이번 틱 유니버스(hot∪watchlist) 시세에서 계산. 순수.
// 순위 델타(60s 창)는 RankTracker 가 이력으로 제공(signals 의 링버퍼 델타와 동일 창·stale 규칙).
import type { Quote } from "../engine/types.js";

const WINDOW_MS = 60_000; // 델타 비교 창(1분)
const KEEP_MS = 70_000; // 보관 창 — 60s-과거 틱이 안정적으로 남게 여유

/** code → (theme → rank). rank = 테마 내 거래대금 내림차순 1-based(1=테마 1등). */
export function computeThemeRanks(
    quotes: Iterable<Quote>,
    themesOf: (code: string) => string[],
): Map<string, Map<string, number>> {
    const byTheme = new Map<string, Quote[]>();
    for (const q of quotes) {
        for (const theme of themesOf(q.code)) {
            const list = byTheme.get(theme);
            if (list) list.push(q);
            else byTheme.set(theme, [q]);
        }
    }
    const out = new Map<string, Map<string, number>>();
    for (const [theme, list] of byTheme) {
        list.sort((a, b) => b.tradeValue - a.tradeValue);
        list.forEach((q, i) => {
            const themes = out.get(q.code) ?? new Map<string, number>();
            themes.set(theme, i + 1);
            out.set(q.code, themes);
        });
    }
    return out;
}

/** (code,theme)별 순위 이력 — 순위 룰 delta(창 내 상승 계단) 계산용. */
export class RankTracker {
    private hist = new Map<string, Array<{ ts: number; rank: number }>>();

    /** 이번 틱 순위를 이력에 적재 + 창 밖 프루닝. 유니버스에서 빠진 (code,theme)는 이력이 말라 자연 소멸. */
    push(ranks: Map<string, Map<string, number>>, now: number): void {
        for (const [code, themes] of ranks) {
            for (const [theme, rank] of themes) {
                const key = `${code}|${theme}`;
                const h = this.hist.get(key) ?? [];
                h.push({ ts: now, rank });
                while (h.length && h[0].ts < now - KEEP_MS) h.shift();
                this.hist.set(key, h);
            }
        }
        // 이번 틱에 안 실린 키의 옛 이력 프루닝(맵 누수 방지)
        for (const [key, h] of this.hist) {
            while (h.length && h[0].ts < now - KEEP_MS) h.shift();
            if (h.length === 0) this.hist.delete(key);
        }
    }

    /** ~60초 전 순위. 그런 틱이 없거나 갭 너머 stale(>2×창)이면 undefined → 비교 거부(signals 와 동일 규칙). */
    rankAgo(code: string, theme: string, now: number): number | undefined {
        const h = this.hist.get(`${code}|${theme}`);
        if (!h) return undefined;
        const target = now - WINDOW_MS;
        for (let i = h.length - 1; i >= 0; i--) {
            if (h[i].ts <= target) return now - h[i].ts > WINDOW_MS * 2 ? undefined : h[i].rank;
        }
        return undefined; // 아직 60초치 이력이 안 쌓임
    }
}
