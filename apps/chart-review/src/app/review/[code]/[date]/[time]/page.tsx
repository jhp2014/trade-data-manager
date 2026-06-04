import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { resolveInitialSelection } from "@/lib/selection";
import { loadReviewRows } from "@/lib/loadReviewRows";
import { loadManualKeys } from "@/lib/loadManualKeys";
import { getReadSheetConfig } from "@/lib/readSheetConfig";
import { notFound } from "next/navigation";

type ReviewPageProps = {
  params: {
    code: string;
    date: string;
    time: string;
  };
};

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: ReviewPageProps) {
  const [rows, manualKeys] = await Promise.all([loadReviewRows(), loadManualKeys()]);
  const groups = groupSheetRows(rows);
  if (groups.length === 0) notFound();

  const initialSelection = resolveInitialSelection(groups, {
    stockCode: params.code,
    tradeDate: params.date,
    tradeTime: params.time,
  });

  const sheetConfig = getReadSheetConfig();

  return (
    <ReviewWorkspace
      groups={groups}
      initialSelection={initialSelection}
      manualKeys={manualKeys}
      initialTab={sheetConfig.tab}
      hasSpreadsheet={Boolean(sheetConfig.spreadsheetId)}
    />
  );
}
