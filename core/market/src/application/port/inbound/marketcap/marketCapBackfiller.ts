// Inbound(driving) 포트 — 날짜별 시총 백필(일회성 Command, 쓰기).
// 시총은 이후 당일당일 입력 운영으로 가고, 이 백필은 과거 구간을 한 번 채우는 용도다.
import type { DateRange } from "../../../../domain/index.js";

export interface MarketCapBackfillResult {
    stockCode: string;
    range: DateRange;
    /** list-info 이벤트 수(현재총수·delta 복원에 쓰인). */
    eventCount: number;
    /** 복원한 현재 총발행주식수(없으면 실패). */
    totalShares: string | null;
    /** 받은 원주가 거래일 수. */
    rawDays: number;
    /** 기록한 시총 행 수. */
    stored: number;
}

export interface MarketCapBackfiller {
    /** 특정 종목의 [from,to] 날짜별 시총을 채운다(비거래일 자연 스킵). */
    backfill(stockCode: string, range: DateRange): Promise<MarketCapBackfillResult>;
}
