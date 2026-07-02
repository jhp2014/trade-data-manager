// 이슈정리 보드(EOD) 파생 — day-summary 일봉 candle → 종목별 board 지표.
// 분봉 불필요(EOD 복기라 일봉으로 충분). 등락률·눕힌 캔들은 일봉 OHLC를 prevClose 대비 %로.
// 시장 = UN(통합) 기준. 계산은 core domain computeChangeRate(무손실 string).
import { computeChangeRate } from "@trade-data-manager/market/domain";
import type { DailySnapshot } from "../api/daySummary.js";

export interface DailyMetric {
    rate: number; // 등락률 %(종가)
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: number; // 그날 거래대금(원, UN)
}

/** DailySnapshot → EOD 지표. candle 미수집이면 null(카드에서 제외). */
export function dailyMetric(s: DailySnapshot): DailyMetric | null {
    const c = s.candle;
    if (!c) return null;
    // 기준가: 직전 거래일 UN 종가. 없으면(상장일) 당일 시가.
    const base = s.prevCloseUn ?? c.un.open;
    const rate = computeChangeRate(c.un.close, base);
    const openPct = computeChangeRate(c.un.open, base);
    const highPct = computeChangeRate(c.un.high, base);
    const lowPct = computeChangeRate(c.un.low, base);
    if (rate === null || openPct === null || highPct === null || lowPct === null) return null;
    return {
        rate: Number(rate),
        openPct: Number(openPct),
        highPct: Number(highPct),
        lowPct: Number(lowPct),
        amount: Number(c.un.amount),
    };
}
