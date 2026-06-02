import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { resolveInitialSelection } from "@/lib/selection";
import { loadReviewRows } from "@/lib/loadReviewRows";
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
  const rows = await loadReviewRows();
  const groups = groupSheetRows(rows);
  if (groups.length === 0) notFound();

  const initialSelection = resolveInitialSelection(groups, {
    stockCode: params.code,
    tradeDate: params.date,
    tradeTime: params.time,
  });

  return <ReviewWorkspace groups={groups} initialSelection={initialSelection} />;
}
