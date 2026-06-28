// Inbound(driving) 포트 — 일봉 ingest 유스케이스. 앱·CLI·크론이 종목 1개 단위로 호출한다.
import type { DateRange } from "../outbound/dailyCandleProvider.js";

export interface DailyIngestResult {
    stockCode: string;
    /** 소급조정(권리락/배당락/액면분할)이 감지돼 종목 전체를 재수집·덮어썼는가. */
    healed: boolean;
    /** 저장한 일봉 수(증분 = 수집분, 자가치유 = 재수집 전체분). */
    saved: number;
}

/**
 * 일봉 수집 유스케이스. range 생략 시 기본 = 오늘 기준 1년 반(defaultDailyRange).
 * 호출자는 range.from 을 DB 마지막 봉과 ≥1봉 겹치게 잡아 자가치유 경계 비교가 가능하게 한다
 * (기본 범위는 항상 충분히 과거라 겹침이 보장된다).
 */
export interface DailyCandleIngestor {
    ingestDailyCandles(stockCode: string, range?: DateRange): Promise<DailyIngestResult>;
}
