// packages/database/src/schema/utils.ts
import { boolean, date, integer, numeric, time, varchar } from "drizzle-orm/pg-core";
import { MAX_SLOT_COUNT, STAT_AMOUNTS, STAT_RATES } from "./constants";

export function commonCandleFeatureCols(prefix: string = "") {
    const isSlot = prefix !== "";

    // 네이밍 헬퍼 함수
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const key = (name: string) => isSlot ? `${prefix}${capitalize(name)}` : name;
    const dbName = (name: string) => isSlot ? `${prefix}_${name}` : name;

    const cols: any = {};

    // 💡 [수정 포인트] isSlot이 true(슬롯)이면 nullable, false(메인)이면 notNull() 적용
    const applyNotNull = (col: any) => isSlot ? col : col.notNull();

    cols[key("closeRateKrx")] = applyNotNull(numeric(dbName("close_rate_krx"), { precision: 8, scale: 4 }));
    cols[key("closeRateNxt")] = applyNotNull(numeric(dbName("close_rate_nxt"), { precision: 8, scale: 4 }));
    cols[key("tradingAmount")] = applyNotNull(numeric(dbName("trading_amount"), { precision: 18, scale: 1 }));
    cols[key("cumulativeTradingAmount")] = applyNotNull(numeric(dbName("cumulative_trading_amount"), { precision: 18, scale: 1 }));

    // 아래 항목들은 원래부터 nullable이므로 그대로 유지
    cols[key("changeRate5m")] = numeric(dbName("change_rate_5m"), { precision: 8, scale: 4 });
    cols[key("changeRate10m")] = numeric(dbName("change_rate_10m"), { precision: 8, scale: 4 });
    cols[key("changeRate30m")] = numeric(dbName("change_rate_30m"), { precision: 8, scale: 4 });
    cols[key("changeRate60m")] = numeric(dbName("change_rate_60m"), { precision: 8, scale: 4 });
    cols[key("changeRate120m")] = numeric(dbName("change_rate_120m"), { precision: 8, scale: 4 });

    cols[key("dayHighRate")] = numeric(dbName("day_high_rate"), { precision: 8, scale: 4 });
    cols[key("dayHighTime")] = time(dbName("day_high_time"));
    cols[key("pullbackFromDayHigh")] = numeric(dbName("pullback_from_day_high"), { precision: 8, scale: 4 });
    cols[key("minutesSinceDayHigh")] = integer(dbName("minutes_since_day_high"));

    const tsCountPre = isSlot ? `${prefix}Cnt` : "cnt";
    const dbCountPre = isSlot ? `${prefix}_cnt` : "cnt";

    STAT_AMOUNTS.forEach((amount) => {
        const tsKey = `${tsCountPre}${amount}Amt`;
        const dbCol = `${dbCountPre}_${amount}_amt`;

        // 횟수(count) 데이터는 슬롯이어도 기본값 0을 가지도록 처리할 수 있습니다.
        cols[tsKey] = integer(dbCol).notNull().default(0);
    });

    return cols;
}

export function commonThemeStatsCols() {
    const cols: any = {
        avgRate: numeric("avg_rate", { precision: 8, scale: 4 }).notNull(),
        cntTotalStock: integer("cnt_total_stock").notNull().default(0),
    };

    STAT_RATES.forEach(r => {
        cols[`cnt${r}RateStockNum`] = integer(`cnt_${r}_rate_stock_num`).notNull().default(0);
    });

    STAT_AMOUNTS.forEach(a => {
        cols[`cnt${a}AmtStockNum`] = integer(`cnt_${a}_amt_stock_num`).notNull().default(0);
    });

    return cols;
}

/**
 * 헬퍼 함수: 상수 MAX_SLOT_COUNT를 기반으로 슬롯(S1~SN) 컬럼을 동적으로 생성
 */
export function generateDynamicSlots() {
    const slots: any = {};
    for (let i = 1; i <= MAX_SLOT_COUNT; i++) {
        const p = `s${i}`; // ex) s1, s2
        // 종목 코드 추가
        slots[`${p}StockCode`] = varchar(`${p}_stock_code`, { length: 10 });
        // utils.ts의 공통 캔들 지표 추가
        Object.assign(slots, commonCandleFeatureCols(p));
    }
    return slots;
}


/**
 * 특정 좌측 여백($L$) 기준의 구조적 고점 지표 컬럼들 생성
 */
export function pivotHighFeatureCols(margins: number[]) {
    const cols: any = {};

    margins.forEach((m) => {
        const key = `pivot${m}l`; // 예: pivot20l
        const db = `pivot_${m}l`;  // 예: pivot_20l

        cols[`${key}Price`] = numeric(`${db}_price`, { precision: 18, scale: 0 });
        cols[`${key}Date`] = date(`${db}_date`);
        cols[`${key}Days`] = integer(`${db}_days`); // 현재 일봉으로부터 거리 (우측 여백)
        cols[`${key}Rate`] = numeric(`${db}_rate`, { precision: 8, scale: 4 });
        cols[`${key}IsReachable`] = boolean(`${db}_is_reachable`).default(false).notNull();
    });

    return cols;
}

/**
 * N일 내 단순 최고가 및 관련 상세 정보 컬럼 생성
 */
export function simpleMaxPriceCols(windows: number[]) {
    const cols: any = {};

    windows.forEach((w) => {
        const key = `max${w}d`; // camelCase Key (예: max20d)
        const db = `max_${w}d`;  // snake_case DB Name (예: max_20d)

        // 1. 최고가 가격
        cols[`${key}Price`] = numeric(`${db}_price`, { precision: 18, scale: 0 });

        // 2. 최고가 발생 날짜
        cols[`${key}Date`] = date(`${db}_date`);

        // 3. 현재 일봉으로부터의 거리 (일수)
        cols[`${key}Days`] = integer(`${db}_days`);

        // 4. 현재가 대비 최고가 등락률
        cols[`${key}Rate`] = numeric(`${db}_rate`, { precision: 8, scale: 4 });

        cols[`${key}IsReachable`] = boolean(`${db}_is_reachable`).default(false).notNull();
    });

    return cols;
}


/**
 * 매매 의견(인사이트) 관련 공통 컬럼
 */
export function tradingInsightCols() {
    return {
        isSearchable: boolean("is_searchable").default(false).notNull(),
        tradeType: varchar("trade_type", { length: 100 }).notNull(),
    };
}