import { type NextRequest } from "next/server";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import {
  loadReviewRowsForTab,
  loadReviewRowsFromDb,
  resolveDbDateRange,
} from "@/lib/loadReviewRows";
import { groupSheetRows } from "@/lib/groupSheetRows";
import { errorResponse } from "@/lib/apiResponse";

/**
 * ?tab=xxx → 해당 탭 작업셋. tab 없으면 DB 모드.
 * DB 모드는 날짜 범위로 제한한다(?from=&to=, ?all=1 이면 전체).
 * 응답의 range 는 실제 적용된 범위(기본값 echo 용).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const tab = params.get("tab");

  if (!tab) {
    try {
      const monthsParam = params.get("months");
      const range = await resolveDbDateRange({
        from: params.get("from") ?? undefined,
        to: params.get("to") ?? undefined,
        all: params.get("all") === "1",
        months: monthsParam ? Number(monthsParam) : undefined,
      });
      const rows = await loadReviewRowsFromDb(range);
      const groups = groupSheetRows(rows);
      return Response.json({ groups, source: "db", range });
    } catch (err) {
      return errorResponse(err);
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
    return errorResponse(err);
  }
}
