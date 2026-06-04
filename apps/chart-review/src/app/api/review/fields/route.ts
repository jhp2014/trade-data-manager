import { loadReviewRowsFromDb } from "@/lib/loadReviewRows";

/**
 * DB 전체 레코드에서 수집 가능한 feature / manual(m_) 필드 키 목록을 반환.
 * export 컬럼 설정 시 시트 작업셋에 무관하게 모든 DB 컬럼을 표시하기 위해 사용.
 */
export async function GET() {
  try {
    const rows = await loadReviewRowsFromDb();
    const features = new Set<string>();
    const manual = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row.features)) features.add(key);
      for (const key of Object.keys(row.manual)) manual.add(`m_${key}`);
    }
    return Response.json({
      featureKeys: [...features].sort(),
      manualKeys: [...manual].sort(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
