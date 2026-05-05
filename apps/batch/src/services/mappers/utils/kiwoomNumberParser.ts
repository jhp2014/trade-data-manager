// services/mappers/utils/kiwoomNumberParser.ts

/**
 * 키움 응답의 가격/거래량 문자열을 정규화합니다.
 * 키움은 가격에 전일 대비 등락 표시("+", "-")를 prefix로 붙여 내려주지만,
 * 이는 부호가 아닌 시각적 표시이며 실제 값은 항상 절댓값입니다.
 * 따라서 "+"와 "-"를 모두 제거하고 절댓값 문자열을 반환합니다.
 */
export function normalizeSignedNumber(raw: string | null | undefined): string {
    if (raw === null || raw === undefined || raw === "") return "0";
    return raw.replace(/^[+-]/, "");        // "+600" → "600", "-78800" → "78800"
}


/** numeric → bigint (거래량 등 정수 컬럼용) */
export function toBigInt(raw: string | null | undefined): bigint {
    return BigInt(normalizeSignedNumber(raw));
}