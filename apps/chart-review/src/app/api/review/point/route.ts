import { NextResponse } from "next/server";
import { deleteReviewPointById, upsertReviewPoint } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { resolvePointFeatures } from "@/lib/loadReviewRows";

export const dynamic = "force-dynamic";

/**
 * POST /api/review/point
 * body: { stockCode, tradeDate, tradeTime, payload }
 * Point 1건 입력/수정(upsert). 대상 Target 은 이미 존재해야 한다.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { stockCode, tradeDate, tradeTime, payload } = (body ?? {}) as {
    stockCode?: string;
    tradeDate?: string;
    tradeTime?: string;
    payload?: Record<string, string | string[]>;
  };

  if (!stockCode || !tradeDate || !tradeTime) {
    return NextResponse.json(
      { error: "stockCode, tradeDate, tradeTime 이 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const result = await upsertReviewPoint(db, {
      stockCode,
      tradeDate,
      tradeTime: normalizeTime(tradeTime),
      payload: payload ?? {},
    });
    // 저장 직후 서버 파생 feature 를 함께 돌려줘, 클라이언트가 새로고침 없이도
    // f-append/Export 에서 정확한 feature 값을 출력할 수 있게 한다.
    const features = await resolvePointFeatures(stockCode, tradeDate, tradeTime);
    return NextResponse.json({ ...result, features });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/review/point
 * body: { reviewId }
 */
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { reviewId } = (body ?? {}) as { reviewId?: string };
  if (!reviewId || !/^\d+$/.test(reviewId)) {
    return NextResponse.json({ error: "유효한 reviewId 가 필요합니다." }, { status: 400 });
  }

  try {
    const db = getDb();
    await deleteReviewPointById(db, BigInt(reviewId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** "HH:MM" → "HH:MM:00" (DB time 컬럼용). 이미 초가 있으면 그대로. */
function normalizeTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}
