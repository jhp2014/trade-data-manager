// /news/hts 계약 — HTS(시황) 헤드라인 표시용 부분집합. 항상 최신순. srno 는 페이징 커서.
export interface HtsNewsItem {
    srno: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    title: string;
    sourceName: string;
    categoryCode: string;
}
