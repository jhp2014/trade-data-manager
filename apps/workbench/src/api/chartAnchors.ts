// 차트 앵커 CRUD 클라이언트 — 선(param 'baseline')과 파라미터 앵커(무시 캔들)가 한 자원. wire 타입 공유.
// **가격이 아니라 앵커(캔들 좌표)를 저장**한다 — 해소 결과(RenderLine 뷰모델)는 lib/chartFrame 소유
// (여기는 와이어 계약 자리 — 옛 priceLines·pointAnchors 두 클라이언트를 흡수했다. 소유는 차트(종목,날짜)).
import type { AddChartAnchorInput, ChartAnchor, RemoveChartAnchorInput } from "@trade-data-manager/wire";
import { apiGet, apiPost } from "./http.js";

export type { AddChartAnchorInput, ChartAnchor, RemoveChartAnchorInput, AnchorField, AnchorMarket } from "@trade-data-manager/wire";

/** 이 차트(종목,날짜)의 모든 앵커. */
export const fetchChartAnchors = (code: string, date: string, signal?: AbortSignal): Promise<ChartAnchor[]> =>
    apiGet<ChartAnchor[]>("chart-anchors", { code, date }, signal);

/** 앵커 추가 — 같은 좌표 재추가는 멱등(서버가 기존 행 반환). param 규칙 검증은 서버(레지스트리). */
export const addChartAnchor = (anchor: AddChartAnchorInput): Promise<ChartAnchor> => apiPost<ChartAnchor>("chart-anchors", anchor);

/**
 * 앵커 1개 삭제 — **좌표(자연키)로 지목**. 추가와 같은 튜플을 보낸다.
 * id 를 안 쓰는 이유: 읽기는 로컬 미러라 surrogate id 가 원격과 갈릴 수 있다(→ 엉뚱한 행 삭제).
 * 화면 안에서 id 를 손잡이로 쓰는 건 그대로다 — 훅이 경계에서 좌표로 바꿔 보낸다.
 */
export const removeChartAnchor = (anchor: RemoveChartAnchorInput): Promise<void> =>
    apiPost<{ ok: true }>("chart-anchors/remove", anchor).then(() => undefined);

/** 전 앵커(전 param) — 클라 큐레이션 복제본의 테이블 로드. 접기(존재 지도)는 lib/presence.ts. */
export const fetchAllChartAnchors = (signal?: AbortSignal): Promise<ChartAnchor[]> => apiGet<ChartAnchor[]>("chart-anchors/all", undefined, signal);
