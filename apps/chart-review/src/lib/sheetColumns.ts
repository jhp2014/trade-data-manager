/**
 * Sheet export 의 컬럼 규칙(앱 전용 Sheet 계층).
 * - 고정 컬럼 순서와 manual(m_) 헤더 네이밍을 정의한다.
 * - 피처 컬럼 목록(FEATURE_COLUMNS)은 DB 투영 계약이라 data-core 가 소유한다(여기서 import).
 */

export const FIXED_COLUMNS = [
  "groupId",
  "reviewId",
  "stockCode",
  "stockName",
  "tradeDate",
  "tradeTime",
  "lineTargets",
] as const;

/** payload 키 → Sheet manual 헤더. 앞쪽 밑줄을 떼고 "m_" 접두사를 붙인다. */
export function toManualHeader(key: string): string {
  return `m_${key.replace(/^_+/, "")}`;
}
