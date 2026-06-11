// 수동 입력(m_) 값의 직렬화 규칙: 다중값은 " | " 로 이어붙인 한 문자열로 표시/저장한다.
// 시트 셀·payload·필터·프리셋이 모두 이 규칙을 공유한다.

export const MANUAL_VALUE_SEP = " | ";

/** 키에서 "m_" 접두사를 떼어 원본 키 이름만 남긴다(접두사가 없으면 그대로). */
export function stripManualPrefix(key: string): string {
  return key.startsWith("m_") ? key.slice(2) : key;
}

/** "a | b" → ["a","b"]. 빈 값/공백은 제거한다. */
export function splitManualValue(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}

/** string | string[] → 표시/저장용 문자열. 배열은 " | " 로 합친다. */
export function joinManualValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(MANUAL_VALUE_SEP) : value;
}

/** payload(string|string[]) record → manual(string) record. */
export function flattenManualPayload(
  payload: Record<string, string | string[]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) out[key] = joinManualValue(value);
  return out;
}
