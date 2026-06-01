import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { resolveInitialSelection } from "@/lib/selection";
import { mockSheetRows } from "@/mock/sheetRows";

type ReviewPageProps = {
  params: {
    code: string;
    date: string;
    time: string;
  };
};

export default function ReviewPage({ params }: ReviewPageProps) {
  const groups = groupSheetRows(mockSheetRows);
  const initialSelection = resolveInitialSelection(groups, {
    stockCode: params.code,
    tradeDate: params.date,
    tradeTime: params.time,
  });

  return <ReviewWorkspace groups={groups} initialSelection={initialSelection} />;
}
