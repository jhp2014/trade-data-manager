import type { MinuteCandle } from "@trade-data-manager/market-data";

/* ===========================================================
 * 1. 공통 Calculator 인터페이스 (제네릭)
 * =========================================================== */

/**
 * 모든 Calculator의 기본 형태.
 * - TContext: 계산에 필요한 입력 데이터 (도메인마다 다름)
 * - TOutput: 계산 결과 (컬럼명 → 값 매핑)
 */
export interface FeatureCalculator<TContext, TOutput = Record<string, any>> {
    /**
     * 이 Calculator가 책임지는 DB 컬럼들의 정의를 반환.
     * Drizzle ORM의 컬럼 빌더 객체(numeric, integer, ...)를 키-값으로 반환합니다.
     */
    columns(opts?: ColumnOptions): Record<string, any>;

    /**
     * 실제 계산 로직. ctx를 받아 컬럼명-값 객체를 반환.
     */
    calculate(ctx: TContext): TOutput;

    /**
     * 누적 상태(state)가 있는 Calculator는 이 메서드를 구현.
     * Runner가 종목/날짜 단위로 작업이 바뀔 때 호출합니다.
     */
    reset?(): void;
}

export interface ColumnOptions {
    /** true면 notNull 제약을 적용하지 않음 */
    nullable?: boolean;
}

/* ===========================================================
 * 2. 분봉 Calculator
 * =========================================================== */

/**
 * 분봉 Calculator가 받는 컨텍스트.
 * - 한 종목의 하루치 분봉 배열을 통째로 들고 있어서, 과거 시점 조회가 용이.
 */
export interface MinuteCandleContext {
    /** 현재 처리 중인 분봉 */
    current: MinuteCandle;
    /** 같은 종목 + 같은 날짜의 모든 분봉 (시간 ASC) */
    candles: MinuteCandle[];
    /** 현재 분봉의 candles 배열 내 인덱스 */
    index: number;

    /**
     * "현재 시각으로부터 minutesAgo분 이전"에 해당하는 가장 가까운 과거 캔들 반환.
     * 데이터가 없으면 null. 이 헬퍼는 Runner가 채워줌.
     */
    findCandleMinutesAgo(minutesAgo: number): MinuteCandle | null;
}

export type MinuteFeatureCalculator = FeatureCalculator<MinuteCandleContext>;
