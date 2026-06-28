// infra/broker/minute/kisMinuteAdapter — KIS 단독 MinuteCandleProvider.
// KRX(div "J") + UN(div "UN") 두 슬라이스를 풀데이 수집해 시각으로 머지. 상대 벤더(키움)는 모른다.
import type { MinuteCandle, MinuteCandleProvider } from "@trade-data-manager/market";
import type { KisMinuteCandle } from "@trade-data-manager/kis";
import { mergeMarkets, type TimeBar } from "./merge.js";

/** 어댑터가 KIS에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). */
export interface KisMinuteSource {
    collectDayMinutes(
        stockCode: string,
        date: string,
        params?: { marketDiv?: string; startTime?: string; earliestTime?: string; maxPages?: number },
    ): Promise<KisMinuteCandle[]>;
}

// 풀데이 윈도: NXT 프리마켓(08:00~)부터 시간외 단일가(~20:00)까지 키움과 동일 범위로.
const START_TIME = "200000";
const EARLIEST_TIME = "080000";
const MAX_PAGES = 12;

/** "YYYY-MM-DD" → "YYYYMMDD" (KIS date 형식). */
const compact = (date: string): string => date.replace(/-/g, "");

/** KIS 분봉 raw → TimeBar[]. stck_cntg_hour = HHMMSS. (collectDayMinutes 가 날짜필터·오름차순 보장) */
function toTimeBars(rows: KisMinuteCandle[]): TimeBar[] {
    return rows.map((r) => {
        const hms = r.stck_cntg_hour;
        return {
            time: `${hms.substring(0, 2)}:${hms.substring(2, 4)}:${hms.substring(4, 6)}`,
            bar: {
                open: r.stck_oprc,
                high: r.stck_hgpr,
                low: r.stck_lwpr,
                close: r.stck_prpr,
                volume: r.cntg_vol,
            },
        };
    });
}

export class KisMinuteAdapter implements MinuteCandleProvider {
    constructor(private readonly source: KisMinuteSource) {}

    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        const compactDate = compact(date);
        const opts = { startTime: START_TIME, earliestTime: EARLIEST_TIME, maxPages: MAX_PAGES };
        const [krxRows, unRows] = await Promise.all([
            this.source.collectDayMinutes(stockCode, compactDate, { ...opts, marketDiv: "J" }),
            this.source.collectDayMinutes(stockCode, compactDate, { ...opts, marketDiv: "UN" }),
        ]);
        return mergeMarkets(stockCode, date, toTimeBars(krxRows), toTimeBars(unRows));
    }
}
