import { type NextRequest } from "next/server";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { loadReviewRowsForTab, loadReviewRowsFromDb } from "@/lib/loadReviewRows";
import { groupSheetRows } from "@/lib/groupSheetRows";

/** ?tab=xxx → 해당 탭 작업셋. tab 없으면 DB 전체 모드. */
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab");

  if (!tab) {
    try {
      const rows = await loadReviewRowsFromDb();
      const groups = groupSheetRows(rows);
      return Response.json({ groups, source: "db" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: message }, { status: 500 });
    }
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
