// 날짜 표시 공용 — 여러 패널이 쓰는 요일/날짜 라벨. (KST 거래일 문자열 YYYY-MM-DD 기준)
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 오늘(KST) YYYY-MM-DD. UTC 기반 toISOString 은 KST 새벽(00:00~08:59)에 전날로 잡히므로 timeZone 지정. */
export function kstToday(): string {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/** 로컬 요일 문자(일~토). 빈/비정상 입력은 빈 문자열. */
export function weekdayOf(date: string): string {
    if (!date) return "";
    return WEEKDAYS[new Date(`${date}T00:00:00`).getDay()] ?? "";
}

/** "YYYY-MM-DD (요일)" — 뉴스 날짜 구분선. */
export function dateLabel(date: string): string {
    if (!date) return "";
    return `${date} (${weekdayOf(date)})`;
}
