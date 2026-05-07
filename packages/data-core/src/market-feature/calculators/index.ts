import type { MinuteFeatureCalculator } from "../types";
import { CloseRateKrxCalculator } from "./CloseRateKrxCalculator";
import { CloseRateNxtCalculator } from "./CloseRateNxtCalculator";
import { TradingAmountCalculator } from "./TradingAmountCalculator";
import { ChangeRateCalculator } from "./ChangeRateCalculator";
import { DayHighCalculator } from "./DayHighCalculator";
import { PullbackCalculator } from "./PullbackCalculator";
import { CumulativeAmountCalculator } from "./CumulativeAmountCalculator";
import { AmountCountCalculator } from "./AmountCountCalculator";
import { STAT_AMOUNTS } from "../constants";

export {
    CloseRateKrxCalculator,
    CloseRateNxtCalculator,
    TradingAmountCalculator,
    ChangeRateCalculator,
    DayHighCalculator,
    PullbackCalculator,
    CumulativeAmountCalculator,
    AmountCountCalculator,
};

/**
 * 분봉 피처 가공 Calculator 등록 목록.
 * ⭐ 컬럼 추가/제거는 이 배열만 수정하면 끝.
 *
 * 식별 메타 컬럼(tradeDate / stockCode / tradeTime)은 schema/features.ts 에
 * 명시적으로 정의되어 있으며 runner 가 직접 채운다. Calculator 로 다루지 않는다.
 *
 * 정렬: raw 데이터 → 변동률 → 고점 → 거래대금
 */
export const MINUTE_CALCULATORS: MinuteFeatureCalculator[] = [
    // 분봉 raw 데이터
    new CloseRateKrxCalculator(),
    new CloseRateNxtCalculator(),
    new TradingAmountCalculator(),

    // N분 전 대비 변동률
    new ChangeRateCalculator(5),
    new ChangeRateCalculator(10),
    new ChangeRateCalculator(30),
    new ChangeRateCalculator(60),
    new ChangeRateCalculator(120),

    // 당일 고점 (rate, time 상태 공유)
    new DayHighCalculator(),
    // 고점 대비 정보 (PullbackCalculator는 자체 dayHigh 추적)
    new PullbackCalculator(),

    // 거래대금
    new CumulativeAmountCalculator(),
    ...STAT_AMOUNTS.map((a) => new AmountCountCalculator(a)),
];
