import { NextResponse } from "next/server";
import {
  mergeReviewPointPayloads,
  type PayloadMergeItem,
} from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { fetchSheetRowsAction } from "@/actions/sheet";
import { getReadSheetConfig, hasSheetsCredentials } from "@/lib/readSheetConfig";
import { errorResponse, parseJsonBody } from "@/lib/apiResponse";
import { splitManualValue } from "@/lib/manualValue";

export const dynamic = "force-dynamic";

/** "a | b" → ["a","b"]. 단일 값이면 string, 비어있으면 undefined. */
function parseManualValue(raw: string): string | string[] | undefined {
  const parts = splitManualValue(raw);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : parts;
}

/**
 * POST /api/review/import-merge
 * body: { spreadsheetId?, tab? }
 * 시트를 읽어 비어있지 않은 m_ 값만 DB payload_json 에 병합(덮어쓰기)한다.
 * - 빈 셀은 건드리지 않는다(삭제 금지).
 * - reviewId 우선, 없으면 (code+date+time) 좌표로 식별. 못 찾으면 스킵+리포트.
 * spreadsheetId/tab 미지정 시 읽기 시트 설정(쿠키/env)을 사용.
 */
export async function POST(request: Request) {
  // 본문 없이 호출 가능: 파싱 실패 시 빈 객체로 두고 읽기 시트 설정을 사용.
  const body = (await parseJsonBody(request)) ?? {};

  const { spreadsheetId, tab } = body as { spreadsheetId?: string; tab?: string };

  if (!hasSheetsCredentials()) {
    return NextResponse.json(
      { error: "서비스 계정 자격증명이 없습니다(.env 설정 필요)." },
      { status: 400 },
    );
  }

  const fallback = getReadSheetConfig();
  const targetId = spreadsheetId?.trim() || fallback.spreadsheetId || undefined;
  const targetTab = tab?.trim() || fallback.tab;
  if (!targetId) {
    return NextResponse.json(
      { error: "읽을 스프레드시트 ID 가 필요합니다(입력 또는 읽기 시트 설정)." },
      { status: 400 },
    );
  }

  try {
    const rows = await fetchSheetRowsAction({ spreadsheetId: targetId, tab: targetTab });

    const items: PayloadMergeItem[] = rows.map((row) => {
      const values: Record<string, string | string[]> = {};
      for (const [key, raw] of Object.entries(row.manual)) {
        const parsed = parseManualValue(raw ?? "");
        if (parsed !== undefined) values[key] = parsed;
      }
      return {
        reviewId: row.reviewId || undefined,
        stockCode: row.stockCode,
        tradeDate: row.tradeDate,
        tradeTime: row.tradeTime || undefined,
        values,
        ref: row.tradeTime
          ? `행${row.rowNumber} ${row.stockCode} ${row.tradeDate} ${row.tradeTime}`
          : `행${row.rowNumber} ${row.stockCode} ${row.tradeDate}`,
      };
    });

    const db = getDb();
    const report = await mergeReviewPointPayloads(db, items);

    return NextResponse.json({
      ok: true,
      tab: targetTab,
      total: rows.length,
      merged: report.merged,
      skippedNoValues: report.skippedNoValues.length,
      skippedNotFound: report.skippedNotFound.length,
      notFoundRefs: report.skippedNotFound.slice(0, 20),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
