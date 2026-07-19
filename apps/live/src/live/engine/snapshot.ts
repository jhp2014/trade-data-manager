// 라이브 스냅샷 조립 — 엔진 store + 연결상태 → 직렬화 가능한 뷰(계약은 @tdm/wire).
// 가격은 원주가 **값**으로 싣는다(% 는 클라가 basePrice 시장별 base 로 계산 — 복기와 같은 "값+base" 철학).
// deltas(30초·1분 원시)·ranks(테마 순위)도 같은 철학 — 원재료만 배급, 판정(signal 술어 임계)은 클라 보드
// 필터가 자기 설정으로. 순위는 알람(computeThemeRanks)과 같은 함수·같은 입력 = 같은 잣대(어긋날 수 없음).
import type { ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import type { LiveSnapshot, LiveStock } from "@trade-data-manager/wire";
import type { EngineStore } from "./store.js";
import type { MembershipSource } from "./membership.js";
import type { DailyContextSource } from "./dailyContext.js";
import { activeDelta, computeDeltas } from "./signals.js";
import { computeThemeRanks, rankKey } from "../alerts/themeRank.js";

const NEWLY_HOT_MS = 60_000; // 최근 60초 내 편입 = 신규(🆕)

// ConnectionStatus(kiwoom/ws)와 LiveConnectionStatus(wire)는 동일 문자열 유니언 → 그대로 대입 가능.
// watch = watchlist(타겟) — hot 에서 이탈해도 스냅샷에 남는다(watched 플래그로 구분).
export function buildSnapshot(store: EngineStore, membership: MembershipSource, dailyCtx: DailyContextSource, status: ConnectionStatus, now: number, watch: ReadonlySet<string> = new Set()): LiveSnapshot {
    // 테마 등락률 순위 — 이번 스냅샷 유니버스 전체에서 1회 계산(수십 종목이라 저렴).
    const prevCloseOf = (code: string, market: "krx" | "un"): number | undefined => dailyCtx.contextOf(code)?.basePrice[market] ?? undefined;
    const ranks = computeThemeRanks(store.quotes.values(), (c) => membership.themesOf(c), prevCloseOf);
    const rankList = (code: string, themes: string[], market: "krx" | "un"): number[] => {
        const out: number[] = [];
        for (const t of themes) {
            const r = ranks.get(rankKey(code, t, market));
            if (r != null) out.push(r);
        }
        return out;
    };

    const stocks: LiveStock[] = [];
    for (const code of new Set([...store.hot, ...watch])) {
        const q = store.quotes.get(code);
        if (!q) continue; // 시세 아직 없는 종목은 스킵(다음 틱 폴링에 잡힘)
        const since = store.hotSince.get(code);
        const ctx = dailyCtx.contextOf(code); // 미계산(핫 편입 직후)이면 두 필드 생략 — 클라가 base 폴백
        const themes = membership.themesOf(code);
        const deltas = computeDeltas(store.historyOf(code), now);
        const krxRanks = rankList(code, themes, "krx");
        const unRanks = rankList(code, themes, "un");
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
            themes,
            basePrice: ctx?.basePrice,
            trailingHighs: ctx?.trailingHighs,
            signal: activeDelta(store.historyOf(code), now) ?? undefined,
            deltas: deltas.d30s || deltas.d1m ? deltas : undefined, // 빈 객체는 생략(와이어 절약)
            ranks: krxRanks.length || unRanks.length ? { krx: krxRanks, un: unRanks } : undefined,
            watched: watch.has(code) || undefined, // false 는 생략(와이어 절약)
        });
    }
    return { ts: now, status, hot: store.hot.size, polled: store.quotes.size, stocks };
}
