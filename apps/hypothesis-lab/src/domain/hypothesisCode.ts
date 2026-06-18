/**
 * 가설 표시 코드. 서로게이트 id 에서 파생하며 별도 저장하지 않는다.
 *   1 → "H0001", 42 → "H0042", 12345 → "H12345"
 */
export function formatHypothesisCode(id: bigint | number | string): string {
    return `H${String(id).padStart(4, "0")}`;
}
