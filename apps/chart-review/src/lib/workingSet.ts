import type { ReviewLoadKey } from "@trade-data-manager/data-core";
import { fetchSheetRowsAction } from "@/actions/sheet";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";

/**
 * 현재 작업셋의 (stockCode, tradeDate) 키 목록을 해석한다(서버 전용).
 * - 읽기 시트가 설정돼 있으면(쿠키/env) 그 시트를 읽어 dedupe 한 키를 반환.
 * - 시트 미설정이면 null → 호출부에서 "DB 전체"로 해석한다.
 * - 시트는 있지만 행이 없으면 빈 배열을 반환한다.
 */
export async function resolveWorkingSetKeys(): Promise<ReviewLoadKey[] | null> {
  const sheet = getReadSheetConfig();
  if (!sheet.spreadsheetId || !hasSheetsCredentials()) return null;

  const rows = await fetchSheetRowsAction({ spreadsheetId: sheet.spreadsheetId, tab: sheet.tab });
  const seen = new Set<string>();
  const keys: ReviewLoadKey[] = [];
  for (const row of rows) {
    if (!row.stockCode || !row.tradeDate) continue;
    const id = `${row.stockCode}|${row.tradeDate}`;
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push({ stockCode: row.stockCode, tradeDate: row.tradeDate });
  }
  return keys;
}
