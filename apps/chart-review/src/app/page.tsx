import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { loadSheetRows } from "@/lib/loadSheetRows";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await loadSheetRows();
  const first = rows[0];
  if (!first) notFound();

  const timeSegment = first.tradeTime || "_";
  redirect(`/review/${first.stockCode}/${first.tradeDate}/${timeSegment}`);
}
