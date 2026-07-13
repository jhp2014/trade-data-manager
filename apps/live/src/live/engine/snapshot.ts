// 라이브 스냅샷 조립 — 엔진 store + 연결상태 → 직렬화 가능한 뷰(계약은 @tdm/wire).
// 가격은 원주가 **값**으로 싣는다(% 는 클라가 rawPrevClose 시장별 base 로 계산 — 복기와 같은 "값+base" 철학).
import type { ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import type { LiveSnapshot, LiveStock } from "@trade-data-manager/wire";
import type { EngineStore } from "./store.js";
import type { MembershipSource } from "./membership.js";
import type { DailyContextSource } from "./dailyContext.js";
import { activeDelta } from "./signals.js";

const NEWLY_HOT_MS = 60_000; // 최근 60초 내 편입 = 신규(🆕)

// ConnectionStatus(kiwoom/ws)와 LiveConnectionStatus(wire)는 동일 문자열 유니언 → 그대로 대입 가능.
// watch = watchlist(타겟) — hot 에서 이탈해도 스냅샷에 남는다(watched 플래그로 구분).
export function buildSnapshot(store: EngineStore, membership: MembershipSource, dailyCtx: DailyContextSource, status: ConnectionStatus, now: number, watch: ReadonlySet<string> = new Set()): LiveSnapshot {
    const stocks: LiveStock[] = [];
    for (const code of new Set([...store.hot, ...watch])) {
        const q = store.quotes.get(code);
        if (!q) continue; // 시세 아직 없는 종목은 스킵(다음 틱 폴링에 잡힘)
        const since = store.hotSince.get(code);
        const ctx = dailyCtx.contextOf(code); // 미계산(핫 편입 직후)이면 두 필드 생략 — 클라가 base 폴백
        stocks.push({
            code: q.code,
            name: q.name,
            price: q.price,
            changeRate: q.changeRate,
            tradeValue: q.tradeValue,
            marketCap: q.marketCap,
            open: q.open,
            high: q.high,
            low: q.low,
            base: q.base,
            newlyHot: since != null && now - since <= NEWLY_HOT_MS,
            themes: membership.themesOf(code),
            rawPrevClose: ctx?.rawPrevClose,
            trailingHighs: ctx?.trailingHighs,
            signal: activeDelta(store.historyOf(code), now) ?? undefined,
            watched: watch.has(code) || undefined, // false 는 생략(와이어 절약)
        });
    }
    return { ts: now, status, hot: store.hot.size, polled: store.quotes.size, stocks };
}
