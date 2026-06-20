/**
 * 가설 표시 코드. 서로게이트 id 에서 파생하며 별도 저장하지 않는다.
 * DB 의 id 와 동일하게 패딩 없이 표기한다.
 *   1 → "H1", 42 → "H42", 12345 → "H12345"
 */
export function formatHypothesisCode(id: bigint | number | string): string {
    return `H${String(id)}`;
}
