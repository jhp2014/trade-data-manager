import { type NextRequest } from "next/server";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { loadReviewRowsForTab } from "@/lib/loadReviewRows";
import { groupSheetRows } from "@/lib/groupSheetRows";

/** ?tab=xxx の作業셋(ReviewStockGroup[])を返す。 */
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab");
  if (!tab) {
    return Response.json({ error: "tab parameter required" }, { status: 400 });
  }

  const config = getReadSheetConfig();
  if (!config.spreadsheetId || !hasSheetsCredentials()) {
    return Response.json({ error: "no spreadsheet configured" }, { status: 400 });
  }

  try {
    const rows = await loadReviewRowsForTab(config.spreadsheetId, tab);
    const groups = groupSheetRows(rows);
    return Response.json({ groups, tab });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
