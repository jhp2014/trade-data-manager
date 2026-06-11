import { type NextRequest } from "next/server";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { appendSheetRow } from "@/lib/sheetsWriter";
import { errorResponse, parseJsonBody } from "@/lib/apiResponse";

type AppendBody = {
  writeTab: string;
  headers: string[];
  values: string[];
};

/** Write Tab 의 마지막 행 아래에 1 행을 추가한다. 탭이 비어있으면 헤더도 함께 추가. */
export async function POST(req: NextRequest) {
  const config = getReadSheetConfig();
  if (!config.spreadsheetId || !hasSheetsCredentials()) {
    return Response.json({ error: "spreadsheet not configured" }, { status: 400 });
  }

  const body = await parseJsonBody<AppendBody>(req);
  if (body === null) {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { writeTab, headers, values } = body;
  if (!writeTab || !Array.isArray(headers) || !Array.isArray(values)) {
    return Response.json({ error: "writeTab, headers, values are required" }, { status: 400 });
  }

  try {
    const result = await appendSheetRow(config.spreadsheetId, writeTab, headers, values);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
