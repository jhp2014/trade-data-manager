import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { resolveInitialSelection } from "@/lib/selection";
import {
  loadReviewRows,
  loadReviewRowsForTab,
  loadReviewRowsFromDb,
  resolveDbDateRange,
  type DbDateRange,
} from "@/lib/loadReviewRows";
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
  // DB 모드 기본 날짜 범위(최신 기준 최근 1개월). 시트 모드면 무시되지만 미리 해석해 둔다.
  let initialDbRange: DbDateRange = initialReadSource === "db" ? await resolveDbDateRange() : null;

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

  // 시트에서 찾지 못하면 DB(기본 날짜 범위)로 fallback (404 방지).
  if (groups.length === 0) {
    try {
      const fallbackRange = await resolveDbDateRange();
      const dbRows = await loadReviewRowsFromDb(fallbackRange);
      const dbGroups = groupSheetRows(dbRows);
      if (dbGroups.length > 0) {
        groups = dbGroups;
        initialReadSource = "db";
        initialDbRange = fallbackRange;
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
      initialDbRange={initialDbRange}
    />
  );
}
