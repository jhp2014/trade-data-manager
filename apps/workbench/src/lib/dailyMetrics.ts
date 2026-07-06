// 테마보드(EOD) 파생 — day-summary 스냅샷의 구운 %(조정 불변)를 그대로 board 지표로.
// 서버(DerivedCache 빌드)가 일봉 OHLC를 직전 UN 종가 대비 %로 미리 구워 내려준다 — 클라 재계산 없음.
import type { DailySnapshot } from "../api/daySummary.js";

export interface DailyMetric {
    rate: number; // 등락률 %(종가)
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: number; // 그날 거래대금(원, UN)
}

/** DailySnapshot → EOD 지표. 일봉 미수집(파생 null)이면 null(카드에서 제외). */
export function dailyMetric(s: DailySnapshot): DailyMetric | null {
    if (s.changeRate === null || s.openPct === null || s.highPct === null || s.lowPct === null || s.amount === null) return null;
    return {
        rate: s.changeRate,
        openPct: s.openPct,
        highPct: s.highPct,
        lowPct: s.lowPct,
        amount: Number(s.amount),
    };
}
