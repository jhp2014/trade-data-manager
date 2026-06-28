// infra/broker/minute/kiwoomMinuteAdapter — 키움 단독 MinuteCandleProvider.
// KRX(평문코드) + UN(코드_AL) 두 슬라이스를 풀데이 수집해 시각으로 머지. 상대 벤더(KIS)는 모른다.
import type { MinuteCandle, MinuteCandleProvider } from "@trade-data-manager/market";
import type { KiwoomMinuteCandle } from "@trade-data-manager/kiwoom";
import { mergeMarkets, type TimeBar } from "./merge.js";

/** 어댑터가 키움에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). */
export interface KiwoomMinuteSource {
    getMinuteChartsForDate(
        stockCode: string,
        tradeDate: string,
        maxPages?: number,
    ): Promise<KiwoomMinuteCandle[]>;
}

/** 키움 분봉 풀데이 수집 안전 페이지 상한(자동 조기종료 — 이전 거래일 도달 시 멈춤). */
const MAX_PAGES = 10;

/** 키움은 가격에 전일대비 시각표시 "+/-" 를 붙인다 — 도메인엔 절댓값만. */
const strip = (s: string): string => s.replace(/^[+-]/, "");

/** "YYYY-MM-DD" → "YYYYMMDD" (키움 base_dt 형식). */
const compact = (date: string): string => date.replace(/-/g, "");

/** 키움 분봉 raw → 해당 날짜의 TimeBar[]. cntr_tm = YYYYMMDDHHMMSS. */
function toTimeBars(rows: KiwoomMinuteCandle[], compactDate: string): TimeBar[] {
    const out: TimeBar[] = [];
    for (const r of rows) {
        if (r.cntr_tm.substring(0, 8) !== compactDate) continue;
        const hms = r.cntr_tm.substring(8, 14); // HHMMSS
        out.push({
            time: `${hms.substring(0, 2)}:${hms.substring(2, 4)}:${hms.substring(4, 6)}`,
            bar: {
                open: strip(r.open_pric),
                high: strip(r.high_pric),
                low: strip(r.low_pric),
                close: strip(r.cur_prc),
                volume: strip(r.trde_qty),
            },
        });
    }
    return out;
}

export class KiwoomMinuteAdapter implements MinuteCandleProvider {
    constructor(private readonly source: KiwoomMinuteSource) {}

    async getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]> {
        const compactDate = compact(date);
        const [krxRows, unRows] = await Promise.all([
            this.source.getMinuteChartsForDate(stockCode, compactDate, MAX_PAGES),
            this.source.getMinuteChartsForDate(`${stockCode}_AL`, compactDate, MAX_PAGES),
        ]);
        return mergeMarkets(
            stockCode,
            date,
            toTimeBars(krxRows, compactDate),
            toTimeBars(unRows, compactDate),
        );
    }
}
