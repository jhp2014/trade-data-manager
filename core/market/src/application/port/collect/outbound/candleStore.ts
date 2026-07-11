import type { DailyCandle, MinuteCandle } from "#domain";

/**
 * 일봉 저장/자가치유 포트(collect — 쓰기 + 경계 read). 구현은 infra/db(Drizzle).
 * save 는 (tradeDate, stockCode) 자연키 upsert(재수집 시 그 행 교체). FK 없음 — 무결성은 ingest 가 관리.
 * 자가치유 overwrite(소급조정 감지 후 종목 전체 재수집)는 use case 가 getDailyCandle 로 경계 비교 후 save.
 * (읽기 전용 조회는 query 의 AdjustedDailyReader·DailyCandleSnapshotReader 로 분리했다.)
 */
export interface DailyCandleStore {
    saveDailyCandles(candles: DailyCandle[]): Promise<void>;
    /** 단일 (종목,날) 일봉. 자가치유 경계 비교용. 없으면 null. */
    getDailyCandle(stockCode: string, date: string): Promise<DailyCandle | null>;
    /** 종목의 가장 과거 저장 거래일(YYYY-MM-DD). 자가치유 시 "저장된 전체" 재수집 하한. 데이터 없으면 null. */
    getEarliestDailyDate(stockCode: string): Promise<string | null>;
}

/**
 * 분봉 저장/재수집 포트(collect — 쓰기 + dedup). 구현은 infra/db(Drizzle).
 * save 는 (tradeDate, stockCode, tradeTime) 자연키 upsert. 적재 단위 = (종목, 하루).
 * (읽기 전용 조회는 query 의 MinuteReader 로 분리했다.)
 */
export interface MinuteCandleStore {
    saveMinuteCandles(candles: MinuteCandle[]): Promise<void>;
    /**
     * 그 거래일에 분봉이 저장된 종목코드들(distinct). collect 의 재개 판단용:
     * 기대집합(일봉 재계산 후보) − 이 저장집합 = 아직 못 받은 종목. 부분 실패가 다음 실행에서 이어짐.
     * (예전 hasMinuteCandlesOnDate 는 "1건이라도 있으면 완료"라 부분 상태를 영구 누락으로 굳혔다.)
     */
    getMinuteStockCodesOnDate(date: string): Promise<string[]>;
    /** 그 거래일 전체 분봉 삭제(overwrite=true 시 비우고 새로 — orphan 방지). 삭제한 행 수. */
    deleteMinuteCandlesOnDate(date: string): Promise<number>;
}
