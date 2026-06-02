import { NextResponse } from "next/server";
import { addManualKey, deleteManualKey, listManualKeys } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";

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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/review/manual-keys  body: { key, label? } → 키 추가(멱등) */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { key, label } = (body ?? {}) as { key?: string; label?: string };
  const trimmed = key?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "key 가 필요합니다." }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    return NextResponse.json(
      { error: "key 는 영문/숫자/밑줄만 사용할 수 있습니다." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    await addManualKey(db, { key: trimmed, label: label ?? null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/review/manual-keys  body: { key } → 키 완전 삭제(payload 데이터까지 제거) */
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const { key } = (body ?? {}) as { key?: string };
  const trimmed = key?.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "key 가 필요합니다." }, { status: 400 });
  }

  try {
    const db = getDb();
    const purged = await deleteManualKey(db, trimmed);
    return NextResponse.json({ ok: true, purged });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
