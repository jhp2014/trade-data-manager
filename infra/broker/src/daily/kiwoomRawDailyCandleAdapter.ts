// infra/broker/daily/kiwoomRawDailyCandleAdapter — 키움 단독 RawDailyCandleProvider(원주가 미수정).
// KiwoomDailyAdapter(수정주가)의 원주가판: 소스만 getRawDailyChartsForRange(upd_stkpc_tp:"0")로 다르고
// KRX(평문코드)+UN(코드_AL) 머지 로직은 동일. close-only KiwoomRawDailyAdapter(시총용)와 달리 전체 OHLCV 캔들.
import type {
    DailyCandle,
    DateRange,
    RawDailyCandleProvider,
} from "@trade-data-manager/market";
import type { KiwoomDailyCandle } from "@trade-data-manager/kiwoom";
import { mergeDailyMarkets, type DateBar } from "./merge.js";

/** 어댑터가 키움에서 필요로 하는 최소 표면(원주가 기간수집). 날짜는 compact "YYYYMMDD". */
export interface KiwoomRawDailyCandleSource {
    getRawDailyChartsForRange(
        stockCode: string,
        fromDate: string,
        toDate: string,
        maxPages?: number,
    ): Promise<KiwoomDailyCandle[]>;
}

/** 일봉 기간 수집 안전 페이지 상한(from 이전 도달 시 자동 조기종료). */
const MAX_PAGES = 20;

/** 키움은 가격에 전일대비 "+/-" 를 붙인다 — 도메인엔 절댓값만. */
const strip = (s: string): string => s.replace(/^[+-]/, "");

/** "YYYY-MM-DD" → "YYYYMMDD" (키움 base_dt 형식). */
const compact = (date: string): string => date.replace(/-/g, "");

/** 키움 거래대금(trde_prica)은 백만원 단위 → 원(₩)으로 무손실 환산(×1e6). 빈값은 0. */
function amountToWon(raw: string): string {
    const v = strip(raw);
    return (BigInt(v === "" ? "0" : v) * 1_000_000n).toString();
}

/** 키움 일봉 raw → [from,to] 범위로 절단한 DateBar[]. dt = YYYYMMDD. */
function toDateBars(rows: KiwoomDailyCandle[], fromCompact: string, toCompact: string): DateBar[] {
    const out: DateBar[] = [];
    for (const r of rows) {
        const dt = r.dt;
        if (dt < fromCompact || dt > toCompact) continue;
        out.push({
            date: `${dt.substring(0, 4)}-${dt.substring(4, 6)}-${dt.substring(6, 8)}`,
            bar: {
                open: strip(r.open_pric),
                high: strip(r.high_pric),
                low: strip(r.low_pric),
                close: strip(r.cur_prc),
                volume: strip(r.trde_qty),
                amount: amountToWon(r.trde_prica),
            },
        });
    }
    return out;
}

export class KiwoomRawDailyCandleAdapter implements RawDailyCandleProvider {
    constructor(private readonly source: KiwoomRawDailyCandleSource) {}

    async getRawDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]> {
        const fromC = compact(range.from);
        const toC = compact(range.to);
        const [krxRows, unRows] = await Promise.all([
            this.source.getRawDailyChartsForRange(stockCode, fromC, toC, MAX_PAGES),
            this.source.getRawDailyChartsForRange(`${stockCode}_AL`, fromC, toC, MAX_PAGES),
        ]);
        return mergeDailyMarkets(
            stockCode,
            toDateBars(krxRows, fromC, toC),
            toDateBars(unRows, fromC, toC),
        );
    }
}
