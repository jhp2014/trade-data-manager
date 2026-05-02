import type {
    MinuteCandle,
} from "@trade-data-manager/market-data";

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
     *
     * @param opts.prefix - 슬롯용 접두사 (예: "s1" → 컬럼명: s1_close_rate_krx)
     * @param opts.nullable - 슬롯에서는 notNull을 풀어야 할 수 있음
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
    /** 컬럼명 접두사 (camelCase: "s1", "s2"; DB는 자동으로 snake_case로 변환) */
    prefix?: string;
    /** true면 notNull 제약을 적용하지 않음 (슬롯/옵션 컬럼용) */
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

/* ===========================================================
 * 3. 테마 통계 Calculator (theme_features)
 * =========================================================== */

/**
 * 한 시각, 한 테마에 속한 N개 종목의 분봉 피처들로부터 통계를 뽑는 컨텍스트.
 */
export interface ThemeFeatureContext {
    themeId: bigint;
    tradeDate: string;
    tradeTime: string;
    /** 이 테마에 속한 모든 종목의 (해당 시각) 분봉 피처 */
    stockFeatures: MinuteFeatureRow[];
}

/**
 * minute_candle_features 테이블의 한 행을 표현하는 느슨한 타입.
 * (Calculator로 자동 생성된 컬럼이 많아 정확한 타입은 schema에서 추론 후 별칭 부여 예정)
 */
export type MinuteFeatureRow = Record<string, any>;

export type ThemeFeatureCalculator = FeatureCalculator<ThemeFeatureContext>;

/* ===========================================================
 * 4. 테마 컨텍스트 Calculator (theme_stock_contexts)
 * =========================================================== */

/**
 * 한 테마 내 N개 종목의 순위/관계 정보를 계산하는 컨텍스트.
 * - 각 종목별로 한 행씩 출력되므로, calculate는 단일 종목 기준으로 실행.
 */
export interface ThemeContextInput {
    themeId: bigint;
    themeFeatureId: bigint;
    tradeDate: string;
    tradeTime: string;

    /** 현재 계산 대상 종목의 분봉 피처 */
    target: MinuteFeatureRow;
    /** 같은 테마 내 모든 종목의 분봉 피처 (순위 계산에 필요) */
    peers: MinuteFeatureRow[];
}

export type ThemeContextCalculator = FeatureCalculator<ThemeContextInput>;
