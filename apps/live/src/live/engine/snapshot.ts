// 라이브 스냅샷 조립 — 엔진 store + 연결상태 → 직렬화 가능한 뷰.
// 후속: signals(델타)·themeRank·흐리게(distanceToHigh) 추가, 타입은 contracts(@tdm/wire)로 이관.
import type { ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import type { EngineStore } from "./store.js";

const NEWLY_HOT_MS = 60_000; // 최근 60초 내 편입 = 신규(🆕)

/** 캔들 % (전일 기준가 대비). base 0 이면 0. */
function pct(v: number, base: number): number {
    return base > 0 ? ((v - base) / base) * 100 : 0;
}

export interface LiveStock {
    code: string;
    name: string;
    price: number;
    changeRate: number;
    tradeValue: number; // 백만원
    marketCap: number; // 억원
    openPct: number;
    highPct: number;
    lowPct: number;
    newlyHot: boolean;
}

export interface LiveSnapshot {
    ts: number;
    status: ConnectionStatus;
    hot: number; // 스캔 hit 수
    polled: number; // 시세 보유 종목 수
    stocks: LiveStock[];
}

export function buildSnapshot(store: EngineStore, status: ConnectionStatus, now: number): LiveSnapshot {
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
        });
    }
    return { ts: now, status, hot: store.hot.size, polled: store.quotes.size, stocks };
}
