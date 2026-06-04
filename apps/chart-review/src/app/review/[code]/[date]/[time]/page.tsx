import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { resolveInitialSelection } from "@/lib/selection";
import { loadReviewRows, loadReviewRowsForTab } from "@/lib/loadReviewRows";
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

  // 현재 탭이 비어있으면 다른 탭으로 자동 fallback.
  // 스프레드시트가 설정된 경우에만 시도한다(미설정이면 DB 전체 로드이므로 바로 notFound).
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
      // fallback 실패 시 아래 notFound() 로 낙하.
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
    />
  );
}
