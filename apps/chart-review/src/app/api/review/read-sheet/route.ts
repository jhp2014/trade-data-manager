import { NextResponse } from "next/server";
import { getReadSheetConfig, hasSheetsCredentials, READ_SHEET_COOKIE } from "@/lib/readSheetConfig";

export const dynamic = "force-dynamic";

/** GET /api/review/read-sheet → 현재 읽기 시트 설정 + 자격증명 여부 */
export async function GET() {
  const sheet = getReadSheetConfig();
  return NextResponse.json({
    spreadsheetId: sheet.spreadsheetId,
    tab: sheet.tab,
    source: sheet.source,
    hasCredentials: hasSheetsCredentials(),
  });
}

/**
 * POST /api/review/read-sheet  body: { spreadsheetId, tab? }
 * 읽기 시트 설정을 쿠키에 저장한다(작업셋 정의용). 자격증명은 env 유지.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { spreadsheetId, tab } = (body ?? {}) as { spreadsheetId?: string; tab?: string };
  const id = spreadsheetId?.trim();
  if (!id) {
    return NextResponse.json({ error: "spreadsheetId 가 필요합니다." }, { status: 400 });
  }

  const value = JSON.stringify({ id, tab: tab?.trim() || "review" });
  const res = NextResponse.json({ ok: true, spreadsheetId: id, tab: tab?.trim() || "review" });
  res.cookies.set(READ_SHEET_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** DELETE /api/review/read-sheet → 쿠키 제거(env 폴백으로 복귀) */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(READ_SHEET_COOKIE);
  return res;
}
