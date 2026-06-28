// core/market/domain/minuteRank — 분 단위 누적거래대금 순위로 "한 번이라도 상위 N"을 추린다(순수함수).
// 분봉 저장 필터의 핵심: pool(거래대금 탑400 등) 분봉을 받아 매 분 누적거래대금 랭킹을 매기고,
// 장중 한 시점이라도 탑N(기본 100)에 든 종목을 모은다 → 아침에 탑100이었다 밀린 모닝주도주까지 포착.
//
// 누적거래대금 = UN 바 (OHLC평균×량)의 시간 누적(price.ts). 단조증가라 carry-forward 비교.
import { computeMinuteTradingAmount, computeAccumulatedAmounts } from "./price.js";
import type { MinuteCandle } from "./model.js";

export interface PoolStockMinutes {
    stockCode: string;
    /** 시간 오름차순 분봉(어댑터 계약). 빈 배열이면 순위 계산에서 제외. */
    candles: MinuteCandle[];
}

/** "HH:MM:SS" → 자정 기준 분(分). */
function toMinute(time: string): number {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
}

/**
 * pool 종목들 중 분 단위 누적거래대금이 한 번이라도 상위 topN 에 든 종목 stockCode 들(입력 순서 보존).
 */
export function selectMinuteTop100Ever(pool: PoolStockMinutes[], topN = 100): string[] {
    // 분(分) → 그 분에 갱신되는 (종목, 누적거래대금) 목록. 누적은 단조증가라 갱신된 값만 들고 carry-forward.
    const updatesByMinute = new Map<number, Array<[string, bigint]>>();
    const allMinutes = new Set<number>();

    for (const { stockCode, candles } of pool) {
        if (candles.length === 0) continue;
        const cum = computeAccumulatedAmounts(candles.map((c) => computeMinuteTradingAmount(c.un)));
        candles.forEach((c, i) => {
            const t = toMinute(c.time);
            allMinutes.add(t);
            const list = updatesByMinute.get(t);
            const entry: [string, bigint] = [stockCode, BigInt(cum[i])];
            if (list) list.push(entry);
            else updatesByMinute.set(t, [entry]);
        });
    }

    const current = new Map<string, bigint>(); // 종목 → 현재(carry-forward) 누적거래대금
    const ever = new Set<string>();

    for (const t of [...allMinutes].sort((a, b) => a - b)) {
        for (const [code, v] of updatesByMinute.get(t) ?? []) current.set(code, v);
        const ranked = [...current.entries()]
            .filter(([, v]) => v > 0n)
            .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
            .slice(0, topN);
        for (const [code] of ranked) ever.add(code);
    }

    return pool.map((p) => p.stockCode).filter((code) => ever.has(code));
}
