import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { resolveInitialSelection } from "@/lib/selection";
import { loadReviewRows, loadReviewRowsForTab, loadReviewRowsFromDb } from "@/lib/loadReviewRows";
import { loadManualKeys } from "@/lib/loadManualKeys";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { getSpreadsheetTabs } from "@/lib/sheetsWriter";
import { notFound } from "next/navigation";
import type { ReviewStockGroup } from "@/types/review";

type ReviewPageProps = {
  params: {
    code: string;
    date: string;
    time: string;
  };
};

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: ReviewPageProps) {
  const sheetConfig = getReadSheetConfig();
  const [rows, manualKeys] = await Promise.all([loadReviewRows(), loadManualKeys()]);
  let groups: ReviewStockGroup[] = groupSheetRows(rows);
  let effectiveTab = sheetConfig.tab;
  let initialReadSource: "sheet" | "db" = sheetConfig.spreadsheetId ? "sheet" : "db";

  // 현재 탭이 비어있으면 다른 시트 탭으로 자동 fallback.
  if (groups.length === 0 && sheetConfig.spreadsheetId && hasSheetsCredentials()) {
    try {
      const allTabs = await getSpreadsheetTabs(sheetConfig.spreadsheetId);
      for (const tab of allTabs) {
        if (tab === effectiveTab) continue;
        const fallbackRows = await loadReviewRowsForTab(sheetConfig.spreadsheetId, tab);
        const fallbackGroups = groupSheetRows(fallbackRows);
        if (fallbackGroups.length > 0) {
          groups = fallbackGroups;
          effectiveTab = tab;
          break;
        }
      }
    } catch {
      // 시트 fallback 실패 시 DB fallback 으로 낙하.
    }
  }

  // 시트에서 찾지 못하면 DB 전체로 fallback (404 방지).
  if (groups.length === 0) {
    try {
      const dbRows = await loadReviewRowsFromDb();
      const dbGroups = groupSheetRows(dbRows);
      if (dbGroups.length > 0) {
        groups = dbGroups;
        initialReadSource = "db";
      }
    } catch {
      // DB fallback 실패 시 notFound.
    }
  }

  if (groups.length === 0) notFound();

  const initialSelection = resolveInitialSelection(groups, {
    stockCode: params.code,
    tradeDate: params.date,
    tradeTime: params.time,
  });

  return (
    <ReviewWorkspace
      groups={groups}
      initialSelection={initialSelection}
      manualKeys={manualKeys}
      initialTab={effectiveTab}
      hasSpreadsheet={Boolean(sheetConfig.spreadsheetId)}
      initialReadSource={initialReadSource}
    />
  );
}
