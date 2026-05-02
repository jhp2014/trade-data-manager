import type { ColumnOptions } from "./types";

/* ===========================================================
 * 1. 컬럼 자동 결합
 * =========================================================== */

/**
 * 여러 Calculator의 columns() 결과를 하나의 객체로 머지.
 * 컬럼명 충돌이 발생하면 즉시 throw (스키마 무결성 보호).
 */
export function buildColumnsFromCalculators(
    calculators: { columns: (opts?: ColumnOptions) => Record<string, any> }[],
    opts?: ColumnOptions
): Record<string, any> {
    const merged: Record<string, any> = {};

    for (const calc of calculators) {
        const cols = calc.columns(opts);
        for (const [key, col] of Object.entries(cols)) {
            if (key in merged) {
                throw new Error(
                    `[buildColumnsFromCalculators] Column name collision: "${key}" ` +
                    `(in ${calc.constructor.name}). Each Calculator must produce unique column keys.`
                );
            }
            merged[key] = col;
        }
    }

    return merged;
}

/* ===========================================================
 * 2. 슬롯 컬럼 빌더 (tradingOpportunities용)
 * =========================================================== */

/**
 * "s1", "s2", ..., "sN" prefix로 같은 Calculator 묶음을 N번 반복 생성.
 * 슬롯 컬럼은 항상 nullable (없는 슬롯도 있을 수 있음).
 */
export function buildSlotColumns(
    slotCount: number,
    calculators: { columns: (opts?: ColumnOptions) => Record<string, any> }[],
    extraSlotCols?: (prefix: string) => Record<string, any>
): Record<string, any> {
    const merged: Record<string, any> = {};

    for (let i = 1; i <= slotCount; i++) {
        const prefix = `s${i}`;

        // 슬롯별 추가 컬럼 (예: stockCode) — Calculator로 다루기 애매한 것들
        if (extraSlotCols) {
            const extras = extraSlotCols(prefix);
            for (const [key, col] of Object.entries(extras)) {
                if (key in merged) {
                    throw new Error(
                        `[buildSlotColumns] Column name collision: "${key}" (slot ${i})`
                    );
                }
                merged[key] = col;
            }
        }

        // Calculator들의 columns를 prefix + nullable로 가져옴
        const slotCols = buildColumnsFromCalculators(calculators, {
            prefix,
            nullable: true,
        });

        for (const [key, col] of Object.entries(slotCols)) {
            if (key in merged) {
                throw new Error(
                    `[buildSlotColumns] Column name collision: "${key}" (slot ${i})`
                );
            }
            merged[key] = col;
        }
    }

    return merged;
}

/* ===========================================================
 * 3. 계산 결과 머지
 * =========================================================== */

/**
 * 여러 Calculator의 calculate() 결과를 하나의 객체로 머지.
 * 키 충돌은 dev 시 빠르게 잡히도록 throw.
 */
export function mergeCalculatorOutputs(
    outputs: Record<string, any>[]
): Record<string, any> {
    const merged: Record<string, any> = {};
    for (const out of outputs) {
        for (const [key, val] of Object.entries(out)) {
            if (key in merged) {
                throw new Error(
                    `[mergeCalculatorOutputs] Output key collision: "${key}". ` +
                    `Two calculators produced the same field.`
                );
            }
            merged[key] = val;
        }
    }
    return merged;
}

/* ===========================================================
 * 4. 네이밍 헬퍼 (Calculator 내부에서 자주 씀)
 * =========================================================== */

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * 슬롯 prefix 적용한 camelCase 키 이름 생성.
 * tsKey("closeRateKrx", "s1") → "s1CloseRateKrx"
 * tsKey("closeRateKrx")       → "closeRateKrx"
 */
export function tsKey(name: string, prefix?: string): string {
    return prefix ? `${prefix}${capitalize(name)}` : name;
}

/**
 * 슬롯 prefix 적용한 snake_case DB 컬럼명 생성.
 * dbKey("close_rate_krx", "s1") → "s1_close_rate_krx"
 * dbKey("close_rate_krx")       → "close_rate_krx"
 */
export function dbKey(name: string, prefix?: string): string {
    return prefix ? `${prefix}_${name}` : name;
}
