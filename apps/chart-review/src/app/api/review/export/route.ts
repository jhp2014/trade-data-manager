import { NextResponse } from "next/server";
import { buildSheetMatrix, findReviewExportRows } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { writeSheetTab } from "@/lib/sheetsWriter";
import { activeFilterCount, payloadMatchesManualFilters } from "@/lib/manualFilter";

export const dynamic = "force-dynamic";

/**
 * POST /api/review/export
 * body: { spreadsheetId?, tab?, filters? }
 * 현재 m_ 필터에 매칭되는 타점만 Google Sheet 로 내보낸다(필터 없으면 전체).
 * spreadsheetId/tab 미지정 시 env 기본값 사용. 탭이 없으면 생성.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { spreadsheetId, tab, filters } = (body ?? {}) as {
    spreadsheetId?: string;
    tab?: string;
    filters?: Record<string, string[]>;
  };

  const targetId = spreadsheetId?.trim() || process.env.GOOGLE_SHEETS_ID?.trim();
  const targetTab = tab?.trim() || process.env.GOOGLE_SHEETS_TAB?.trim() || "review";
  if (!targetId) {
    return NextResponse.json(
      { error: "스프레드시트 ID 가 필요합니다 (입력 또는 GOOGLE_SHEETS_ID)." },
      { status: 400 },
    );
  }

  const activeFilters = filters ?? {};
  const hasFilter = activeFilterCount(activeFilters) > 0;

  try {
    const db = getDb();
    const rows = await findReviewExportRows(db);
    const selected = hasFilter
      ? rows.filter((row) => payloadMatchesManualFilters(row.payload, activeFilters))
      : rows;

    const matrix = buildSheetMatrix(selected, { baseUrl: process.env.REVIEW_APP_BASE_URL });
    await writeSheetTab({ spreadsheetId: targetId, tab: targetTab, matrix });

    return NextResponse.json({
      ok: true,
      tab: targetTab,
      rows: selected.length,
      cols: matrix[0]?.length ?? 0,
      filtered: hasFilter,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
