import { type NextRequest } from "next/server";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { writeSheetTab } from "@/lib/sheetsWriter";
import { errorResponse, parseJsonBody } from "@/lib/apiResponse";

type InitBody = {
  writeTab: string;
  headers: string[];
};

/**
 * 쓰기 탭 초기화: 탭을 비우고 첫 행에 헤더만 기록한다.
 * - 사용자가 시트 내용을 수동으로 다 지운 뒤 다시 쓰기 시작할 때 호출.
 * - writeSheetTab 가 clear → A1 기록 → append 캐시 등록까지 처리하므로,
 *   이후 f-append 는 빠른 경로(append 1회)로 바로 동작한다.
 */
export async function POST(req: NextRequest) {
  const config = getReadSheetConfig();
  if (!config.spreadsheetId || !hasSheetsCredentials()) {
    return Response.json({ error: "spreadsheet not configured" }, { status: 400 });
  }

  const body = await parseJsonBody<InitBody>(req);
  if (body === null) {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { writeTab, headers } = body;
  if (!writeTab || !Array.isArray(headers) || headers.length === 0) {
    return Response.json({ error: "writeTab, non-empty headers are required" }, { status: 400 });
  }

  try {
    await writeSheetTab({ spreadsheetId: config.spreadsheetId, tab: writeTab, matrix: [headers] });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
