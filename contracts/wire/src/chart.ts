// GET /chart 계약 — 일봉 2년 + 당일 dense 분봉 + 분봉 % 기준가. 파생값 0(순수 시계열),
// 소비자(클라)가 domain 순수함수로 %·누적·임계count 를 계산한다.
// daily·minutes 는 core/market 도메인 값타입 그대로라 재노출(서버가 이 타입을 그대로 반환 → 드리프트 불가능).
import type { DailyCandle, MinuteCandle, ByMarket } from "@trade-data-manager/market";

export type { DailyCandle, MinuteCandle };

/**
 * 분봉 % 기준가(시장별) — 원주가 직전 종가 + 감자·액분 조정계수 보정(basePricesOf, 당일 원주가 스케일).
 * 평상일엔 원주가 전일종가와 항등. 상장 첫날 등 없으면 null(클라가 당일 첫 시가 폴백).
 * 보정 시 정수가 아닐 수 있어 number(파생값 — 무손실 string 계약은 원본 시계열에만 적용).
 */
export type BasePrice = ByMarket<number | null>;

/**
 * /chart 응답 봉투.
 * daily 는 수정주가(일봉 pane), minutes 는 원주가 dense(당일), basePrice 는 분봉 % 기준가.
 * 시계열 가격/수량은 무손실 string.
 */
export interface ChartBundle {
    stockCode: string;
    daily: DailyCandle[];
    minutes: MinuteCandle[];
    basePrice: BasePrice | null;
}
