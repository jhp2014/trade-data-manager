// 라이브 스냅샷 조립 — 엔진 store + 연결상태 → 직렬화 가능한 뷰(계약은 @tdm/wire).
// 후속: themeRank·흐리게(distanceToHigh) 필드 추가.
import type { ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import type { LiveSnapshot, LiveStock } from "@trade-data-manager/wire";
import type { EngineStore } from "./store.js";
import type { MembershipSource } from "./membership.js";
import { activeDelta } from "./signals.js";

const NEWLY_HOT_MS = 60_000; // 최근 60초 내 편입 = 신규(🆕)

/** 캔들 % (전일 기준가 대비). base 0 이면 0. */
function pct(v: number, base: number): number {
    return base > 0 ? ((v - base) / base) * 100 : 0;
}

// ConnectionStatus(kiwoom/ws)와 LiveConnectionStatus(wire)는 동일 문자열 유니언 → 그대로 대입 가능.
export function buildSnapshot(store: EngineStore, membership: MembershipSource, status: ConnectionStatus, now: number): LiveSnapshot {
    const stocks: LiveStock[] = [];
    for (const code of store.hot) {
        const q = store.quotes.get(code);
        if (!q) continue; // 시세 아직 없는 hot 은 스킵
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
            signal: activeDelta(store.historyOf(code), now) ?? undefined,
        });
    }
    return { ts: now, status, hot: store.hot.size, polled: store.quotes.size, stocks };
}
