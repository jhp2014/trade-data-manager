import type { ChartReviewPoint } from "@/types/chart";
import type { ReviewStockGroup, SheetPointRow } from "@/types/review";
import { groupSheetRows } from "@/lib/groupSheetRows";

/**
 * 작업셋 밖(테마 탐색 등) 종목의 Point List 그룹을 클라이언트에서 만든다.
 *
 * 테마 번들이 멤버마다 실어 보낸 reviewPoints(payload=m_값) + lineTargets 로
 * SheetPointRow 를 구성해 기존 groupSheetRows 파이프라인에 그대로 태운다.
 * (서버 loadReviewRows.toSheetPointRows 와 동일 규약: payload 배열은 " | " 결합,
 *  lineTargets 는 features.lineTargets 문자열로.)
 *
 * 항상 1개 그룹을 돌려준다. review_target 이지만 포인트가 없으면(빈 reviewPoints)
 * 빈 tradeTime 행 1개를 둬서 호출부가 points[0] 을 안전하게 쓰도록 한다.
 */
export function buildExploredGroup(params: {
  stockCode: string;
  stockName?: string;
  tradeDate: string;
  lineTargets: number[];
  reviewPoints: ChartReviewPoint[];
}): ReviewStockGroup {
  const { stockCode, stockName, tradeDate, lineTargets, reviewPoints } = params;
  const lineTargetsStr = lineTargets.join(" | ");
  const features: Record<string, string> = lineTargetsStr ? { lineTargets: lineTargetsStr } : {};

  const rows: SheetPointRow[] =
    reviewPoints.length === 0
      ? [
          {
            reviewId: "",
            rowNumber: 0,
            stockCode,
            stockName,
            tradeDate,
            tradeTime: "",
            features,
            manual: {},
          },
        ]
      : reviewPoints.map((p, i) => ({
          reviewId: p.reviewId,
          rowNumber: i,
          stockCode,
          stockName,
          tradeDate,
          tradeTime: p.tradeTime.slice(0, 5),
          features,
          manual: toManual(p.payload),
        }));

  return groupSheetRows(rows)[0];
}

/** payload(배열 가능) → manual 문자열. 배열은 " | " 결합. */
function toManual(payload: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = Array.isArray(value) ? value.join(" | ") : value;
  }
  return out;
}
