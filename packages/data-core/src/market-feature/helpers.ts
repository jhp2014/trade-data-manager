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
 * 2. 계산 결과 머지
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
