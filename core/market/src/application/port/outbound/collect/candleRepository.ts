import type { DailyCandle, DateRange, MinuteCandle, PreviousClose } from "#domain";

/**
 * 일봉 저장/조회 포트(ISP — 일봉 능력만). 구현은 infra/db(Drizzle).
 * save 는 (tradeDate, stockCode) 자연키 upsert(재수집 시 그 행 교체). FK 없음 — 무결성은 ingest 가 관리.
 * 자가치유 overwrite(소급조정 감지 후 종목 전체 재수집)는 use case 가 get 으로 경계 비교 후 save 로 수행.
 */
export interface DailyCandleRepository {
    saveDailyCandles(candles: DailyCandle[]): Promise<void>;
    getDailyCandles(stockCode: string, range: DateRange): Promise<DailyCandle[]>;
    /** 단일 (종목,날) 일봉. 자가치유 경계 비교용. 없으면 null. */
    getDailyCandle(stockCode: string, date: string): Promise<DailyCandle | null>;
    /** 종목의 가장 과거 저장 거래일(YYYY-MM-DD). 자가치유 시 "저장된 전체" 재수집 하한. 데이터 없으면 null. */
    getEarliestDailyDate(stockCode: string): Promise<string | null>;
}

/**
 * 당일 요약 스냅샷용 일봉 읽기(ISP — 코드 배치 read 만). DailyCandleRepository(ingest 능력)와 분리한다:
 * 검수 read 소비자(DaySummaryService)만 의존하고 collect 쪽 구현/목은 안 건드리게. 구현은 같은 Drizzle 일봉 repo.
 */
export interface DailyCandleSnapshotReader {
    /** 그 거래일 일봉을 코드 배치로. 없는 코드는 결과에서 빠짐. */
    getByDateAndCodes(date: string, codes: string[]): Promise<DailyCandle[]>;
    /** 각 코드의 직전 거래일 종가(등락률 기준가) — date 이전 최신 캔들의 시장별 close. 없는 코드는 빠짐. */
    getPreviousCloses(date: string, codes: string[]): Promise<PreviousClose[]>;
}

/**
 * 분봉 저장/조회 포트(ISP — 분봉 능력만). 구현은 infra/db(Drizzle).
 * save 는 (tradeDate, stockCode, tradeTime) 자연키 upsert. 적재 단위 = (종목, 하루).
 * 파생값(분봉거래대금·누적·등락률)은 저장하지 않는다 — 도메인 순수함수(price.ts)로 읽을 때 계산.
 */
export interface MinuteCandleRepository {
    saveMinuteCandles(candles: MinuteCandle[]): Promise<void>;
    getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]>;
    /** 그 거래일에 분봉이 하나라도 저장돼 있는가. collect 의 재수집 건너뛰기(overwrite=false) 판단용. */
    hasMinuteCandlesOnDate(date: string): Promise<boolean>;
    /** 그 거래일 전체 분봉 삭제(overwrite=true 시 비우고 새로 — orphan 방지). 삭제한 행 수. */
    deleteMinuteCandlesOnDate(date: string): Promise<number>;
}
