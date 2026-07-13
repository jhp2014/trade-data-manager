// 라이브 스냅샷 조립 — 엔진 store + 연결상태 → 직렬화 가능한 뷰(계약은 @tdm/wire).
// 후속: themeRank·흐리게(distanceToHigh) 필드 추가.
import type { ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import type { LiveSnapshot, LiveStock } from "@trade-data-manager/wire";
import type { EngineStore } from "./store.js";
import type { MembershipSource } from "./membership.js";
import type { TrailingHighsSource } from "./trailingHighs.js";
import { activeDelta } from "./signals.js";

const NEWLY_HOT_MS = 60_000; // 최근 60초 내 편입 = 신규(🆕)

/** 캔들 % (전일 기준가 대비). base 0 이면 0. */
function pct(v: number, base: number): number {
    return base > 0 ? ((v - base) / base) * 100 : 0;
}

// ConnectionStatus(kiwoom/ws)와 LiveConnectionStatus(wire)는 동일 문자열 유니언 → 그대로 대입 가능.
// watch = watchlist(타겟) — hot 에서 이탈해도 스냅샷에 남는다(watched 플래그로 구분).
export function buildSnapshot(store: EngineStore, membership: MembershipSource, trailing: TrailingHighsSource, status: ConnectionStatus, now: number, watch: ReadonlySet<string> = new Set()): LiveSnapshot {
    const stocks: LiveStock[] = [];
    for (const code of new Set([...store.hot, ...watch])) {
        const q = store.quotes.get(code);
        if (!q) continue; // 시세 아직 없는 종목은 스킵(다음 틱 폴링에 잡힘)
        const since = store.hotSince.get(code);
        stocks.push({
            code: q.code,
            name: q.name,
            price: q.price,
            changeRate: q.changeRate,
            tradeValue: q.tradeValue,
            marketCap: q.marketCap,
            openPct: pct(q.open, q.base),
            highPct: pct(q.high, q.base),
            lowPct: pct(q.low, q.base),
            newlyHot: since != null && now - since <= NEWLY_HOT_MS,
            themes: membership.themesOf(code),
            trailingHighs: trailing.highsOf(code),
            signal: activeDelta(store.historyOf(code), now) ?? undefined,
            watched: watch.has(code) || undefined, // false 는 생략(와이어 절약)
        });
    }
    return { ts: now, status, hot: store.hot.size, polled: store.quotes.size, stocks };
}
