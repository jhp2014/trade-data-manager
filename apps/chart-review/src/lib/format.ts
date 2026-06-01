/** 표시용 숫자/문자 포맷 헬퍼 (UI 전용). */

import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";

/** 원 단위 거래대금 → "1,250억" / "320억" / "1.2조". */
export function formatKrwEok(krw: number | null | undefined): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "-";
  const eok = krw / AMOUNT_KRW_TO_EOK;
  if (eok >= 10000) return `${(eok / 10000).toFixed(2)}조`;
  if (eok >= 100) return `${Math.round(eok).toLocaleString("ko-KR")}억`;
  if (eok >= 1) return `${eok.toFixed(1)}억`;
  return `${Math.round(eok * 10000).toLocaleString("ko-KR")}만`;
}

/** 등락률 % → "+12.3%" / "-4.0%". null 은 "-". */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** 길이 초과 시 말줄임. (원문은 title 속성으로 hover 노출) */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
