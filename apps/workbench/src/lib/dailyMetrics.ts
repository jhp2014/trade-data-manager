// 테마보드(EOD) 파생 — day-summary 스냅샷의 구운 %(조정 불변, KRX/UN 두 벌)를 board 지표로.
// 서버(DerivedCache 빌드)가 일봉 OHLC를 시장별 자기 전일종가 대비 %로 미리 구워 내려준다 — 클라 재계산 없음.
// market = 보드 기준 시장 토글. 거래대금(amount)은 항상 UN(통합) — 기준가만 전환, 대금은 통합 관례.
import type { DailySnapshot } from "../api/daySummary.js";
import type { BoardMarket } from "../store/workbench.js";

export interface DailyMetric {
    rate: number; // 등락률 %(종가)
    openPct: number;
    highPct: number;
    lowPct: number;
    amount: number; // 그날 거래대금(원, UN 통합)
}

/** DailySnapshot → EOD 지표(market 기준). 선택 시장 결손 시 반대 시장 폴백(데이터 이상 희소). 둘 다 null 이면 null(카드 제외). */
export function dailyMetric(s: DailySnapshot, market: BoardMarket): DailyMetric | null {
    const st = s.stats[market] ?? (market === "krx" ? s.stats.un : s.stats.krx);
    if (!st) return null;
    return {
        rate: st.changeRate,
        openPct: st.openPct,
        highPct: st.highPct,
        lowPct: st.lowPct,
        amount: Number(s.stats.un?.amount ?? st.amount),
    };
}
