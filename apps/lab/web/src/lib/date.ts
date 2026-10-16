// 날짜 표기 헬퍼(순수). 날짜는 KST 거래일 문자열 YYYY-MM-DD.

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 2026-07-31 → "금". 달력 날짜라 시간대와 무관하게 UTC 로 계산한다. */
export function weekdayKo(date: string): string {
    const [y, m, d] = date.split("-").map(Number);
    return WEEKDAYS_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}

/** 2026-07-31 → "2026-07-31 (금)" */
export const dateLabel = (date: string): string => `${date} (${weekdayKo(date)})`;

const KST_OFFSET_MS = 9 * 3_600_000;

/** ISO 절대시각 → KST "YYYY-MM-DDTHH:MM". 읽을 수 없으면 "" — 깨진 항목 하나로 목록 전체가 죽지 않게. */
function kstIso(iso: string): string {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "" : new Date(t + KST_OFFSET_MS).toISOString();
}

/** ISO 절대시각 → KST 날짜 YYYY-MM-DD(읽을 수 없으면 ""). */
export const kstDateOfIso = (iso: string): string => kstIso(iso).slice(0, 10);

/** ISO 절대시각 → KST HH:MM(읽을 수 없으면 ""). */
export const kstHmOfIso = (iso: string): string => kstIso(iso).slice(11, 16);
