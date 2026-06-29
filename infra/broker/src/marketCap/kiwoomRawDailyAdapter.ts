// infra/broker/marketCap/kiwoomRawDailyAdapter — 키움 원주가(미수정) KRX 일봉 → RawDailyCloseProvider.
// 시총 백필 전용: 저장 일봉은 수정주가라 권리락·액분 시 절대가가 어긋난다 → 미수정 종가(upd_stkpc_tp:"0")로 시총 계산.
// KRX(평문코드) 단독 — UN/_AL 머지 불필요(시총 기준가 = KRX 종가).
import type { DateRange, RawDailyClose, RawDailyCloseProvider } from "@trade-data-manager/market";
import type { KiwoomDailyCandle } from "@trade-data-manager/kiwoom";

/** 어댑터가 키움에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). 날짜는 compact "YYYYMMDD". */
export interface KiwoomRawDailySource {
    getRawDailyChartsForRange(
        stockCode: string,
        fromDate: string,
        toDate: string,
        maxPages?: number,
    ): Promise<KiwoomDailyCandle[]>;
}

/** 일봉 기간 수집 안전 페이지 상한(from 이전 도달 시 자동 조기종료). */
const MAX_PAGES = 20;

/** 키움은 가격에 전일대비 "+/-" 표시를 붙인다 — 절댓값만. */
const strip = (s: string): string => s.replace(/^[+-]/, "");
/** "YYYY-MM-DD" → "YYYYMMDD". */
const compact = (date: string): string => date.replace(/-/g, "");

export class KiwoomRawDailyAdapter implements RawDailyCloseProvider {
    constructor(private readonly source: KiwoomRawDailySource) {}

    async getRawCloses(stockCode: string, range: DateRange): Promise<RawDailyClose[]> {
        const fromC = compact(range.from);
        const toC = compact(range.to);
        const rows = await this.source.getRawDailyChartsForRange(stockCode, fromC, toC, MAX_PAGES);
        const out: RawDailyClose[] = [];
        for (const r of rows) {
            if (r.dt < fromC || r.dt > toC) continue; // 경계 페이지의 범위 밖 절단
            out.push({
                date: `${r.dt.slice(0, 4)}-${r.dt.slice(4, 6)}-${r.dt.slice(6, 8)}`,
                close: strip(r.cur_prc),
            });
        }
        out.sort((a, b) => a.date.localeCompare(b.date));
        return out;
    }
}
