/**
 * 타점 저장/삭제 후 서버 재조회 없이 클라이언트 groups 를 즉시 갱신하는 순수 함수.
 *
 * 안전성 근거: 저장 API(/api/review/point)는 보낸 payload 를 변형 없이 그대로 upsert 하므로
 * "보낸 값 = DB 값" 이 보장된다. feature(amount 등 서버 파생값)는 manual 입력으로 바뀌지
 * 않으므로 기존 값을 유지한다. 신규 타점의 feature 는 아직 DB 에 없어 어차피 빈 값이다.
 */

import type { ReviewStockGroup, SheetPointRow } from "@/types/review";
import { toReviewPoint } from "@/lib/groupSheetRows";

/** payload(string | string[]) → manual(string). 배열은 " | " 로 합친다. */
function flattenPayload(payload: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = Array.isArray(value) ? value.join(" | ") : value;
  }
  return out;
}

export type UpsertPointInput = {
  stockCode: string;
  tradeDate: string;
  /** "HH:MM" (마커 시각). 기존 타점과 앞 5자리로 매칭한다. */
  tradeTime: string;
  /** 저장 응답으로 받은 reviewId. */
  reviewId: string;
  payload: Record<string, string | string[]>;
};

/**
 * 해당 (stockCode, tradeDate, tradeTime) 타점을 추가/교체한 새 groups 를 반환.
 * 대상 그룹이 없으면(작업셋에 없는 종목) 원본을 그대로 반환한다.
 */
export function upsertPointInGroups(
  groups: ReviewStockGroup[],
  input: UpsertPointInput,
): ReviewStockGroup[] {
  const groupKey = `${input.stockCode}|${input.tradeDate}`;
  const hhmm = input.tradeTime.slice(0, 5);
  const manual = flattenPayload(input.payload);

  let changed = false;
  const next = groups.map((group) => {
    if (group.groupKey !== groupKey) return group;
    changed = true;

    const existing = group.points.find(
      (p) => p.reviewId && p.tradeTime.slice(0, 5) === hhmm,
    );

    // 기존 타점이 있으면 sourceRow 를 펼쳐 manual 만 교체(features/themeName 유지). 없으면 신규 행.
    const newRow: SheetPointRow = existing
      ? { ...existing.sourceRow, reviewId: input.reviewId, tradeTime: hhmm, manual }
      : {
          reviewId: input.reviewId,
          rowNumber: group.points.length,
          stockCode: group.stockCode,
          stockName: group.stockName,
          tradeDate: group.tradeDate,
          tradeTime: hhmm,
          features: {},
          manual,
        };
    const newPoint = toReviewPoint(newRow);

    // 기존 placeholder(빈 tradeTime, reviewId 없음)는 신규 타점이 생기면 제거한다.
    const kept = group.points.filter(
      (p) => p.reviewId && p.tradeTime.slice(0, 5) !== hhmm,
    );
    const points = [...kept, newPoint].sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));
    return { ...group, points };
  });

  return changed ? next : groups;
}

/**
 * reviewId 에 해당하는 타점을 제거한 새 groups 를 반환.
 * 제거 후 그룹이 비면, 빈 tradeTime placeholder 1개를 둬서 종목이 사이드바에 남도록 한다.
 */
export function removePointFromGroups(
  groups: ReviewStockGroup[],
  reviewId: string,
): ReviewStockGroup[] {
  let changed = false;
  const next = groups.map((group) => {
    if (!group.points.some((p) => p.reviewId === reviewId)) return group;
    changed = true;

    const filtered = group.points.filter((p) => p.reviewId !== reviewId);
    if (filtered.length > 0) return { ...group, points: filtered };

    // 마지막 타점 삭제 → 빈 placeholder 로 대체(lineTargets 등 feature 는 유지).
    const ref = group.points[0];
    const lineTargets = ref?.sourceRow.features.lineTargets;
    const placeholder = toReviewPoint({
      reviewId: "",
      rowNumber: ref?.rowNumber ?? 0,
      stockCode: group.stockCode,
      stockName: group.stockName,
      tradeDate: group.tradeDate,
      tradeTime: "",
      features: lineTargets ? { lineTargets } : {},
      manual: {},
    });
    return { ...group, points: [placeholder] };
  });

  return changed ? next : groups;
}
