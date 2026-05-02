
import { BaseFieldsCalculator } from "./BaseFieldsCalculator";
import { ChangeRateCalculator } from "./ChangeRateCalculator";
import { DayHighCalculator } from "./DayHighCalculator";
import { PullbackCalculator } from "./PullbackCalculator";
import { CumulativeAmountCalculator } from "./CumulativeAmountCalculator";
import { AmountCountCalculator } from "./AmountCountCalculator";
import { STAT_AMOUNTS } from "../../constants";
import { MinuteFeatureCalculator } from "../../types";

export {
    BaseFieldsCalculator,
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
 * 명시적 타입 지정: MinuteFeatureCalculator[]
 *   - 인터페이스의 reset?() 옵셔널이 보존됨
 *   - calc.reset?.() 호출 가능
 */
export const MINUTE_CALCULATORS: MinuteFeatureCalculator[] = [
    new BaseFieldsCalculator(),

    // N분 전 대비 변동률
    new ChangeRateCalculator(5),
    new ChangeRateCalculator(10),
    new ChangeRateCalculator(30),
    new ChangeRateCalculator(60),
    new ChangeRateCalculator(120),

    // 당일 고점
    new DayHighCalculator(),
    new PullbackCalculator(),

    // 거래대금
    new CumulativeAmountCalculator(),
    ...STAT_AMOUNTS.map((a) => new AmountCountCalculator(a)),
];