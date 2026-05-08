/**
 * 거래대금 단위 Brand 타입(Eok/Mil/Krw) + 변환·포맷 함수.
 * See: docs/decisions/007-unit-brand-types.md
 */

import { AMOUNT_MIL_TO_EOK, AMOUNT_KRW_TO_EOK } from "./constants";

// ── Brand 타입 ──────────────────────────────────────────────────────────────
declare const _brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [_brand]: B };

/** 억원 단위 숫자 (1 = 100,000,000원) */
export type Eok = Brand<number, "eok">;

/** 백만원 단위 숫자 (DB daily `trading_amount_krx` 등) */
export type Mil = Brand<number, "mil">;

/** 원 단위 숫자 (DB minute `trading_amount` 등) */
export type Krw = Brand<number, "krw">;

// ── 변환 함수 ─────────────────────────────────────────────────────────────

/** 백만원 → 억원 */
export function milToEok(v: Mil): Eok {
    return (v / AMOUNT_MIL_TO_EOK) as Eok;
}

/** 원 → 억원 */
export function krwToEok(v: Krw): Eok {
    return (v / AMOUNT_KRW_TO_EOK) as Eok;
}

// ── 포맷 함수 ─────────────────────────────────────────────────────────────

/** 억원 단위 숫자를 사람이 읽기 좋은 문자열로 포맷 */
export function fmtEok(v: Eok): string {
    if (v >= 10000) return `${(v / 10000).toFixed(2)}조`;
    if (v >= 1) return `${v.toFixed(1)}억`;
    if (v >= 0.0001) return `${(v * 10000).toFixed(0)}만`;
    return (v as number).toLocaleString();
}

/**
 * 백만원 단위 숫자를 사람이 읽기 좋은 문자열로 포맷.
 * DB daily 거래대금 표시에 사용.
 */
export function fmtMil(v: number): string {
    return fmtEok(milToEok(v as Mil));
}

/**
 * 원 단위 숫자를 사람이 읽기 좋은 문자열로 포맷.
 * DB minute 거래대금 표시에 사용.
 */
export function fmtKrw(v: number): string {
    return fmtEok(krwToEok(v as Krw));
}
