import { NextResponse } from "next/server";
import { buildSheetMatrix, findReviewExportRows } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { writeSheetTab } from "@/lib/sheetsWriter";
import { activeFilterCount, payloadMatchesManualFilters } from "@/lib/manualFilter";
import { resolveWorkingSetKeys } from "@/lib/workingSet";

export const dynamic = "force-dynamic";

/**
 * POST /api/review/export
 * body: { spreadsheetId?, tab?, filters?, scope? }
 * - scope="working"(기본): 현재 작업셋(읽기 시트 범위)의 타점만 내보낸다.
 *   시트 미설정이면 작업셋 = DB 전체이므로 "all"과 동일하게 동작.
 * - scope="all": DB 전체 타점을 내보낸다.
 * - filters 가 있으면 위 범위 안에서 매칭되는 타점만 남긴다.
 * spreadsheetId/tab 미지정 시 env 기본값 사용. 탭이 없으면 생성.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { spreadsheetId, tab, filters, scope } = (body ?? {}) as {
    spreadsheetId?: string;
    tab?: string;
    filters?: Record<string, string[]>;
    scope?: "working" | "all";
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
  const exportScope = scope === "all" ? "all" : "working";

  try {
    const db = getDb();

    // 작업셋 범위 결정: working 이고 시트가 설정돼 있으면 그 키로 제한.
    let keys: Awaited<ReturnType<typeof resolveWorkingSetKeys>> = null;
    if (exportScope === "working") {
      keys = await resolveWorkingSetKeys();
    }
    const rows = await findReviewExportRows(db, keys ? { keys } : {});
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
      scope: keys ? "working" : "all",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
