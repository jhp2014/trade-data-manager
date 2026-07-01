// 프루닝/스윕 공통 입력 빌더 — 한 거래일 전종목 일봉(+직전 거래일 종가 페어링) → DailyRankInput[].
import type { DailyRankInput } from "#domain";
import type { DailyScanRepository } from "#port/outbound";

/** date 의 전종목 일봉을 읽고 종목별 전일종가(직전 거래일 UN close)를 붙여 DailyRankInput[] 으로. 데이터 없으면 []. */
export async function buildDailyRankInputs(
    scanRepo: DailyScanRepository,
    date: string,
): Promise<DailyRankInput[]> {
    const today = await scanRepo.listDailyCandlesByDate(date);
    if (today.length === 0) return [];

    const prevDate = await scanRepo.getPreviousTradingDate(date);
    const prev = prevDate ? await scanRepo.listDailyCandlesByDate(prevDate) : [];
    const prevClose = new Map(prev.map((c) => [c.stockCode, c.un.close]));

    return today.map((c) => ({
        stockCode: c.stockCode,
        amount: c.un.amount,
        high: c.un.high,
        prevClose: prevClose.get(c.stockCode) ?? null,
    }));
}
