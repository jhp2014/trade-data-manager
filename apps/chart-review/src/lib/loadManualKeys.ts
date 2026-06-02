import { listManualKeys } from "@trade-data-manager/data-core";
import { getDb } from "@/actions/db";

export type ManualKeyDef = { key: string; label: string | null };

/** 수동 입력(m_) 전역 키 레지스트리를 sortOrder 순으로 로드. DB 없으면 빈 배열. */
export async function loadManualKeys(): Promise<ManualKeyDef[]> {
  if (!process.env.DATABASE_URL?.trim()) return [];
  const db = getDb();
  const keys = await listManualKeys(db);
  return keys.map((k) => ({ key: k.key, label: k.label ?? null }));
}
