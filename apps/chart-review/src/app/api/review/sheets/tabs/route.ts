import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { getSpreadsheetTabs } from "@/lib/sheetsWriter";

/** 현재 설정된 spreadsheetId 의 탭 목록을 반환한다. */
export async function GET() {
  const config = getReadSheetConfig();
  if (!config.spreadsheetId || !hasSheetsCredentials()) {
    return Response.json({ tabs: [], spreadsheetId: null });
  }
  try {
    const tabs = await getSpreadsheetTabs(config.spreadsheetId);
    return Response.json({ tabs, spreadsheetId: config.spreadsheetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
