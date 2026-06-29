// infra/broker/marketCap/kisListInfoAdapter — KIS 예탁원정보(상장정보일정) → ListInfoProvider.
// [HHKDB669107C0] output1 = 발행주식수 변동 이벤트(신규상장/증자/감자/액분…). 100슬롯 고정버퍼라 빈 행을 거른다.
// 백필 조회창은 ~13개월 수준이라 슬롯 포화(>100)·CTS 페이징은 발생하지 않는다(발생 시 truncate — 일회성 허용 오차).
import type { ListInfoEvent, ListInfoProvider } from "@trade-data-manager/market";
import type { KisApiResponse, KisListInfoResponse } from "@trade-data-manager/kis";

/** 어댑터가 KIS에서 필요로 하는 최소 표면(테스트 시 스텁 주입 가능). 날짜는 compact "YYYYMMDD". */
export interface KisListInfoSource {
    getListInfo(
        shtCd: string,
        fromDate: string,
        toDate: string,
        cts?: string,
    ): Promise<KisApiResponse<KisListInfoResponse>>;
}

/** "YYYY-MM-DD" → "YYYYMMDD". */
const compact = (date: string): string => date.replace(/-/g, "");
/** "YYYYMMDD" → "YYYY-MM-DD". */
const expand = (ymd: string): string => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
/** 공백패딩 우측정렬 수치 문자열 → trim. 빈값은 "0"(BigInt 안전). */
const numStr = (s: string): string => {
    const t = String(s).trim();
    return t === "" ? "0" : t;
};

export class KisListInfoAdapter implements ListInfoProvider {
    constructor(private readonly source: KisListInfoSource) {}

    async getEvents(stockCode: string, fromDate: string, toDate: string): Promise<ListInfoEvent[]> {
        const res = await this.source.getListInfo(stockCode, compact(fromDate), compact(toDate));
        const rows = res.data.output1 ?? [];
        return rows
            .filter((e) => e.list_dt.trim()) // 빈 슬롯 제거
            .map((e) => ({
                listDate: expand(e.list_dt.trim()),
                issueQty: numStr(e.issue_stk_qty),
                totalShares: numStr(e.tot_issue_stk_qty),
                issuePrice: numStr(e.issue_price),
                issueType: e.issue_type.trim(),
            }))
            .sort((a, b) => a.listDate.localeCompare(b.listDate));
    }
}
