// 경로 표시 — 상황 한 줄 요약과 종목 표기. 경로 줄(이름표 툴팁·카드)과 설정 창 「경로」 칸이 같이 쓴다.
import { CLOSE_TIME, type Situation } from "../store/paths.js";
import { dateLabel } from "../lib/date.js";

/** 종목 표기 — 이름(모르면 코드), 종목 미정이면 null. */
export const stockLabel = (code: string, name: string | null): string | null => (code ? (name ?? code) : null);

/** "2026-07-31 (금) · 10:00 · SK스퀘어" — stock = stockLabel 결과. */
export function summarizeSituation(s: Situation, stock: string | null): string {
    return [s.date ? dateLabel(s.date) : "날짜 없음", s.time || CLOSE_TIME, stock ?? "종목 없음"].join(" · ");
}
