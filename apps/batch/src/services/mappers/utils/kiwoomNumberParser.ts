// services/mappers/utils/kiwoomNumberParser.ts

/**
 * 키움 응답의 숫자 문자열을 정규화합니다.
 * 키움은 "+600", "-78800", "0" 처럼 부호를 문자열에 포함시켜 내려줍니다.
 *
 * - DB의 numeric 컬럼은 string으로 다루므로, 부호 정리만 하고 string으로 반환합니다.
 * - 정밀도 손실을 막기 위해 Number 변환은 절대 하지 않습니다.
 */
export function normalizeSignedNumber(raw: string | null | undefined): string {
    if (raw === null || raw === undefined || raw === "") return "0";
    return raw.replace(/^\+/, "");          // "+600" → "600", "-78800"은 유지
}

/** numeric → bigint (거래량 등 정수 컬럼용) */
export function toBigInt(raw: string | null | undefined): bigint {
    return BigInt(normalizeSignedNumber(raw));
}