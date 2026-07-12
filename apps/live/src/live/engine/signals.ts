// 라이브 1분 델타 신호 — 링버퍼(store.historyOf)에서 최신 vs ~60초 전 델타를 뽑아
// core evaluateSignal(1분 룰)로 판정. tvDelta 단위 변환(백만원→원)만 여기서 한다. 순수·framework-free.
// 정본 규칙·임계는 core/market domain board/signals.ts (복기 보드와 동일 임계 공유).
import { evaluateSignal, type DeltaHit } from "@trade-data-manager/market/domain";
import type { Quote } from "./types.js";

const WINDOW_MS = 60_000; // 델타 비교 창(1분). store 보관창은 이보다 넓어야(70s) 60s-과거 틱이 남는다.

/** ~WINDOW_MS 전 시세(델타 기준점). 그런 틱이 없거나 갭 너머 stale(>2×창)이면 undefined → 비교 거부. */
function pastQuote(h: readonly Quote[], now: number): Quote | undefined {
    const target = now - WINDOW_MS;
    for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].ts <= target) return now - h[i].ts > WINDOW_MS * 2 ? undefined : h[i];
    }
    return undefined; // 아직 60초치 이력이 안 쌓임
}

/** 최신 vs ~60초 전 델타가 신호 임계를 넘으면 DeltaHit(tvDelta 원단위), 아니면 null. */
export function activeDelta(h: readonly Quote[], now: number): DeltaHit | null {
    if (h.length < 2) return null;
    const cur = h[h.length - 1];
    const past = pastQuote(h, now);
    if (!past) return null;
    const rateDelta = cur.changeRate - past.changeRate;
    const tvDeltaKrw = (cur.tradeValue - past.tradeValue) * 1_000_000; // 백만원 → 원
    return evaluateSignal(rateDelta, tvDeltaKrw);
}
