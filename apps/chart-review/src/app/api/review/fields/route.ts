import { listManualKeys } from "@trade-data-manager/data-core";
import { loadReviewRowsFromDb } from "@/lib/loadReviewRows";
import { getDb } from "@/actions/db";
import { errorResponse } from "@/lib/apiResponse";

// 새로 추가한 m_ 키가 즉시 반영되도록 매 요청 동적 처리(정적 캐시 금지).
export const dynamic = "force-dynamic";

/**
 * DB 전체 레코드에서 수집 가능한 feature / manual(m_) 필드 키 목록을 반환.
 * export 컬럼 설정 시 시트 작업셋에 무관하게 모든 DB 컬럼을 표시하기 위해 사용.
 * manual 키는 데이터 파생 키 + 레지스트리(전역 m_ 등록부)의 합집합으로 둔다.
 * → 아직 데이터가 없는 새 m_ 키도 내보내기 컬럼 설정에 노출된다.
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
    for (const k of await listManualKeys(getDb())) manual.add(`m_${k.key}`);
    return Response.json({
      featureKeys: [...features].sort(),
      manualKeys: [...manual].sort(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
