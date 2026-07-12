// 실시간 차트 조립 — apps/api ChartReadModel 과 동일 로직을 DB 대신 kiwoom 어댑터(브로커 라이브)로.
// 세션일은 일봉 최신 캔들에서 도출(장중=오늘 형성봉 / 장외·주말=직전 영업일) — 시계(kstToday) 대신 데이터 기준
// (트레일링 고가 픽스와 동일 철학: 라이브는 브로커 응답에서 세션일을 뽑는다). 상태 없음(어댑터는 kiwoom.rest wrapper).
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { KiwoomDailyAdapter, KiwoomRawDailyCandleAdapter, KiwoomMinuteAdapter } from "@trade-data-manager/broker";
import {
    chartDailyRange,
    subtractMonths,
    densifyMinutes,
    previousCloseFromDaily,
    RAW_DAILY_LOOKBACK_MONTHS,
    kstToday,
} from "@trade-data-manager/market";
import type { ChartBundle } from "@trade-data-manager/wire";

export class LiveChartService {
    private readonly daily: KiwoomDailyAdapter;
    private readonly rawDaily: KiwoomRawDailyCandleAdapter;
    private readonly minute: KiwoomMinuteAdapter;

    constructor(kiwoom: Kiwoom) {
        this.daily = new KiwoomDailyAdapter(kiwoom.rest);
        this.rawDaily = new KiwoomRawDailyCandleAdapter(kiwoom.rest);
        this.minute = new KiwoomMinuteAdapter(kiwoom.rest);
    }

    /**
     * 선택 종목의 ChartBundle — 일봉 2년(수정주가) + 당일/지정일 dense 분봉(원주가) + 원주가 전일종가.
     * date 미지정=오늘(일봉 최신봉에서 세션일 도출, 주말→직전영업일). date 지정=그 날짜(실시간 과거 탐색, REST).
     */
    async chartByCode(stockCode: string, date?: string): Promise<ChartBundle> {
        const anchor = date ?? kstToday();
        const daily = await this.daily.getDailyCandles(stockCode, chartDailyRange(anchor));
        // date 지정이면 그 날짜, 없으면 일봉 최신 거래일(장중=오늘 형성봉 / 장외·주말=직전 영업일).
        const sessionDate = date ?? (daily.length ? daily.reduce((mx, c) => (c.date > mx ? c.date : mx), daily[0].date) : anchor);
        const rawRange = { from: subtractMonths(sessionDate, RAW_DAILY_LOOKBACK_MONTHS), to: sessionDate };
        const [rawMinutes, rawDaily] = await Promise.all([
            this.minute.getMinuteCandles(stockCode, sessionDate),
            this.rawDaily.getRawDailyCandles(stockCode, rawRange),
        ]);
        return { stockCode, daily, minutes: densifyMinutes(rawMinutes), rawBase: previousCloseFromDaily(rawDaily, sessionDate) };
    }
}
