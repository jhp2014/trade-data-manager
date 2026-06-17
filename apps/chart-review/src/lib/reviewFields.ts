/**
 * 리뷰 화면 공용 필드/파싱 헬퍼 (순수 함수).
 * ReviewWorkspace 및 그 하위 컴포넌트(ReviewHeader, PointList, ChartPanels)에서 공유.
 */

import type { ReviewStockGroup, ReviewPoint } from "@/types/review";

/** 헤더/타점 목록의 표시 값 말줄임 길이. */
export const VALUE_TRUNCATE = 15;

/**
 * 붙여넣은 텍스트에서 GroupId(종목코드 + 거래일)를 관대하게 파싱.
 * "005930-2026-05-27", "005930 20260527", "005930_2026/05/27" 등 허용.
 */
export function parseGroupId(text: string): { code: string; date: string } | null {
  // 종목코드는 6자리 영숫자(예: 0126Z0, 0009K0). 숫자만이 아님에 주의.
  const m = text.trim().match(/([0-9A-Za-z]{6})\D*(\d{4})\D?(\d{2})\D?(\d{2})/);
  if (!m) return null;
  return { code: m[1].toUpperCase(), date: `${m[2]}-${m[3]}-${m[4]}` };
}

/**
 * 붙여넣은 텍스트에서 CaseId(GroupId + 시각)를 관대하게 파싱.
 * "036570-2026-06-02-1035", "036570 20260602 1035", "036570-2026-06-02-10:35" 등 허용.
 * 시각이 없으면(=GroupId 형태) 또는 시각이 무효(24시/60분 이상)면 time 은 null.
 */
export function parseCaseId(
  text: string,
): { code: string; date: string; time: string | null } | null {
  const m = text
    .trim()
    .match(/([0-9A-Za-z]{6})\D*(\d{4})\D?(\d{2})\D?(\d{2})(?:\D+(\d{2})\D?(\d{2}))?/);
  if (!m) return null;
  const [hh, mm] = [m[5], m[6]];
  const time = hh && mm && Number(hh) < 24 && Number(mm) < 60 ? `${hh}:${mm}` : null;
  return { code: m[1].toUpperCase(), date: `${m[2]}-${m[3]}-${m[4]}`, time };
}

/** "9010 | 9450" 형태의 파이프 구분 문자열을 유효한 양수 가격 배열로 파싱. */
export function parseLineTargets(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((token) => Number(token.replace(/[^0-9.-]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/** 전 그룹의 manual / feature 키를 모아 정렬. manual 은 m_ 접두 라벨로 변환. */
export function collectFieldKeys(groups: ReviewStockGroup[]) {
  const manual = new Set<string>();
  const feature = new Set<string>();
  for (const group of groups) {
    for (const point of group.points) {
      for (const key of Object.keys(point.sourceRow.manual)) manual.add(`m_${key}`);
      for (const key of Object.keys(point.sourceRow.features)) {
        if (key === "amountText") continue;
        feature.add(key);
      }
    }
  }
  return {
    manualFieldKeys: Array.from(manual).sort(),
    featureFieldKeys: Array.from(feature).sort(),
  };
}

/** 전 그룹 manual 값을 키별 distinct 목록으로 수집 (입력 드로어 추천용). " | " 분해. */
export function collectValueSuggestions(groups: ReviewStockGroup[]): Record<string, string[]> {
  const byKey = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const point of group.points) {
      for (const [key, raw] of Object.entries(point.sourceRow.manual)) {
        if (!raw) continue;
        const set = byKey.get(key) ?? new Set<string>();
        for (const token of raw.split("|")) {
          const value = token.trim();
          if (value) set.add(value);
        }
        byKey.set(key, set);
      }
    }
  }
  const result: Record<string, string[]> = {};
  for (const [key, set] of byKey) result[key] = Array.from(set).sort();
  return result;
}

/** "HH:MM[:SS]" → "HHMM"(시각 없으면 ""). caseId 시각부 구성용. */
function tradeTimeToHHmm(tradeTime: string): string {
  const m = tradeTime.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}${m[2]}` : "";
}

/**
 * 필드 키 → 현재 타점의 값.
 * stockCode/tradeDate/tradeTime/stockName/groupId/caseId + m_xxx + feature 지원.
 */
export function resolveFieldValue(key: string, point: ReviewPoint): string {
  if (key === "stockCode") return point.sourceRow.stockCode ?? "";
  if (key === "tradeDate") return point.sourceRow.tradeDate ?? "";
  if (key === "tradeTime") return point.tradeTime?.slice(0, 5) ?? "";
  if (key === "stockName") return point.sourceRow.stockName ?? "";
  if (key === "groupId") return `${point.sourceRow.stockCode ?? ""}-${point.sourceRow.tradeDate ?? ""}`;
  if (key === "caseId") {
    // GroupId + 타점 시각(HHmm). 타점 시각이 없으면(미입력) GroupId 형태로 fallback.
    const base = `${point.sourceRow.stockCode ?? ""}-${point.sourceRow.tradeDate ?? ""}`;
    const hhmm = tradeTimeToHHmm(point.tradeTime ?? "");
    return hhmm ? `${base}-${hhmm}` : base;
  }
  if (key.startsWith("m_")) return point.sourceRow.manual[key.slice(2)]?.trim() ?? "";
  return point.sourceRow.features[key]?.trim() ?? "";
}

/** 타점 시각 표기. 빈 값이면 "미입력". */
export function formatPointTime(tradeTime: string): string {
  return tradeTime || "미입력";
}
