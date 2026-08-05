// 차트 앵커 CRUD 클라이언트 — 선(param 'baseline')과 파라미터 앵커(무시 캔들)가 한 자원. wire 타입 공유.
// **가격이 아니라 앵커(캔들 좌표)를 저장**한다 — 해소 결과(RenderLine 뷰모델)는 lib/chartFrame 소유
// (여기는 와이어 계약 자리 — 옛 priceLines·pointAnchors 두 클라이언트를 흡수했다. 소유는 차트(종목,날짜)).
import type { AddChartAnchorInput, AnchoredChart, ChartAnchor } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiDelete } from "./http.js";

export type { AddChartAnchorInput, AnchoredChart, ChartAnchor, AnchorField, AnchorMarket } from "@trade-data-manager/wire";

/** 이 차트(종목,날짜)의 모든 앵커. */
export const fetchChartAnchors = (code: string, date: string, signal?: AbortSignal): Promise<ChartAnchor[]> =>
    apiGet<ChartAnchor[]>("chart-anchors", { code, date }, signal);

/** 앵커 추가 — 같은 좌표 재추가는 멱등(서버가 기존 행 반환). param 규칙 검증은 서버(레지스트리). */
export const addChartAnchor = (anchor: AddChartAnchorInput): Promise<ChartAnchor> => apiPost<ChartAnchor>("chart-anchors", anchor);

/** 앵커 1개 삭제(id 지목). */
export const removeChartAnchor = (id: string): Promise<void> => apiDelete(`chart-anchors/${id}`);

/** 기준선(=선)이 하나라도 있는 (종목,날짜) 전부 — 월 그룹은 클라. 날짜 내림차순. */
export const fetchAnchoredCharts = (signal?: AbortSignal): Promise<AnchoredChart[]> => apiGet<AnchoredChart[]>("chart-anchors/stocks", undefined, signal);
