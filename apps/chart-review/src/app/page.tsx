import { redirect } from "next/navigation";
import { mockSheetRows } from "@/mock/sheetRows";

export default function HomePage() {
  const first = mockSheetRows[0];
  redirect(`/review/${first.stockCode}/${first.tradeDate}/${first.tradeTime}`);
}
