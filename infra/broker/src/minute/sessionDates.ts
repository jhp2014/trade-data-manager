// 분봉 어댑터가 함께 쓰는 장 일정 예외.

/** 수능일 — 장이 한 시간 늦게 끝난다(16:30). */
export const LATE_CLOSE_DATES: ReadonlySet<string> = new Set(["2023-11-16", "2024-11-14", "2025-11-13"]);

/** 그날 KRX 정규장 마감(종가 동시호가) 시각, 0시부터의 분. */
export const closeMinutesOf = (date: string): number => (LATE_CLOSE_DATES.has(date) ? 16 * 60 + 30 : 15 * 60 + 30);
