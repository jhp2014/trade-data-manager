import type { DailyCandle, MinuteCandle } from "../../../domain/index.js";
import type { DateRange } from "./dailyCandleProvider.js";

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
}

/**
 * 분봉 저장/조회 포트(ISP — 분봉 능력만). 구현은 infra/db(Drizzle).
 * save 는 (tradeDate, stockCode, tradeTime) 자연키 upsert. 적재 단위 = (종목, 하루).
 * 파생값(분봉거래대금·누적·등락률)은 저장하지 않는다 — 도메인 순수함수(price.ts)로 읽을 때 계산.
 */
export interface MinuteCandleRepository {
    saveMinuteCandles(candles: MinuteCandle[]): Promise<void>;
    getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]>;
}
