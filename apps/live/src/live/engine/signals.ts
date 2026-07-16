// 라이브 델타 — 링버퍼(store.historyOf)에서 최신 vs ~창 전 시세의 델타를 뽑는다. 순수·framework-free.
//  · computeDeltas: 30초·1분 **원재료**(등락률 %p·거래대금 억) — 유니버스 알람 술어(core signal)가
//    설정 임계로 판정하고, 조각 3에서 스냅샷에 실려 보드 필터도 클라 평가한다(원재료 배급 철학).
//  · activeDelta: 1분 고정 임계 판정(core evaluateSignal) — 보드 LiveStock.signal 현행 경로(조각 3 전까지 유지).
import { evaluateSignal, type DeltaHit, type SignalDeltas } from "@trade-data-manager/market/domain";
import type { Quote } from "./types.js";

const WINDOW_1M_MS = 60_000;
const WINDOW_30S_MS = 30_000;

/** ~windowMs 전 시세(델타 기준점). 그런 틱이 없거나 갭 너머 stale(>2×창)이면 undefined → 비교 거부. */
function pastQuoteAt(h: readonly Quote[], now: number, windowMs: number): Quote | undefined {
    const target = now - windowMs;
    for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].ts <= target) return now - h[i].ts > windowMs * 2 ? undefined : h[i];
    }
    return undefined; // 아직 창만큼 이력이 안 쌓임
}

/** 한 창의 원재료 델타 — rate(%p)·tvEok(억). 기준점 없으면 undefined(신규 편입 직후 등). */
function windowDelta(h: readonly Quote[], now: number, windowMs: number): { rate: number; tvEok: number } | undefined {
    if (h.length < 2) return undefined;
    const cur = h[h.length - 1];
    const past = pastQuoteAt(h, now, windowMs);
    if (!past) return undefined;
    return { rate: cur.changeRate - past.changeRate, tvEok: (cur.tradeValue - past.tradeValue) / 100 }; // 백만원→억
}

/** 30초·1분 원재료 델타(core SignalDeltas) — 없는 창은 생략(술어가 false 로 처리). */
export function computeDeltas(h: readonly Quote[], now: number): SignalDeltas {
    const out: SignalDeltas = {};
    const d30s = windowDelta(h, now, WINDOW_30S_MS);
    const d1m = windowDelta(h, now, WINDOW_1M_MS);
    if (d30s) out.d30s = d30s;
    if (d1m) out.d1m = d1m;
    return out;
}

/** 최신 vs ~60초 전 델타가 고정 임계를 넘으면 DeltaHit(tvDelta 원단위), 아니면 null. 보드 signal 현행 경로. */
export function activeDelta(h: readonly Quote[], now: number): DeltaHit | null {
    const d = windowDelta(h, now, WINDOW_1M_MS);
    if (!d) return null;
    return evaluateSignal(d.rate, d.tvEok * 100_000_000); // 억 → 원
}
