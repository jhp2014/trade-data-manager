import { NextResponse } from "next/server";
import {
  addManualKey,
  deleteManualKey,
  listManualKeys,
  renameManualKey,
} from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";
import { badRequest, errorResponse, requireJsonBody, validateManualKey } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/** GET /api/review/manual-keys → 레지스트리 키 목록 */
export async function GET() {
  try {
    const db = getDb();
    const keys = await listManualKeys(db);
    return NextResponse.json(
      keys.map((k) => ({ key: k.key, label: k.label, sortOrder: k.sortOrder })),
    );
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/review/manual-keys  body: { key, label? } → 키 추가(멱등) */
export async function POST(request: Request) {
  const body = await requireJsonBody<{ key?: string; label?: string }>(request);
  if (body instanceof NextResponse) return body;

  const key = validateManualKey(body.key);
  if (key instanceof NextResponse) return key;

  try {
    const db = getDb();
    await addManualKey(db, { key, label: body.label ?? null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PATCH /api/review/manual-keys  body: { from, to } → 키 이름 변경(payload 키까지 이동) */
export async function PATCH(request: Request) {
  const body = await requireJsonBody<{ from?: string; to?: string }>(request);
  if (body instanceof NextResponse) return body;

  const fromKey = body.from?.trim();
  if (!fromKey) return badRequest("from, to 가 필요합니다.");
  const toKey = validateManualKey(body.to);
  if (toKey instanceof NextResponse) return toKey;

  try {
    const db = getDb();
    const { renamedPayloads } = await renameManualKey(db, { from: fromKey, to: toKey });
    return NextResponse.json({ ok: true, renamedPayloads });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE /api/review/manual-keys  body: { key } → 키 완전 삭제(payload 데이터까지 제거) */
export async function DELETE(request: Request) {
  const body = await requireJsonBody<{ key?: string }>(request);
  if (body instanceof NextResponse) return body;

  const trimmed = body.key?.trim();
  if (!trimmed) return badRequest("key 가 필요합니다.");

  try {
    const db = getDb();
    const purged = await deleteManualKey(db, trimmed);
    return NextResponse.json({ ok: true, purged });
  } catch (err) {
    return errorResponse(err);
  }
}
