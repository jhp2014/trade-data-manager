// 차트 앵커 CRUD 클라이언트 — 선(param 'baseline')과 파라미터 앵커(무시 캔들)가 한 자원. wire 타입 공유.
// **가격이 아니라 앵커(캔들 좌표)를 저장**한다 — 표시 시점에 로드된 캔들에서 값을 읽어 RenderLine 으로 해소.
// 옛 priceLines(가격선)·pointAnchors(타점 앵커) 두 클라이언트를 흡수했다. 소유는 차트(종목,날짜).
import type { AddChartAnchorInput, AnchoredChart, ChartAnchor } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiDelete } from "./http.js";

export type { AddChartAnchorInput, AnchoredChart, ChartAnchor, AnchorField, AnchorMarket } from "@trade-data-manager/wire";

/** 차트 렌더용 — 앵커를 로드된 캔들에서 해소한 결과. 차트 컴포넌트는 이것만 안다(와이어 아님, 클라 뷰모델). */
export interface RenderLine {
    id: string;
    price: number; // 해소된 raw 가격(원)
    kind: "D" | "M" | "A"; // 일봉/분봉 앵커(주석) 또는 A=알람 가격조건 — 색·%분모(D=전일종가, M=당일 기준가)
    label?: string; // 축 라벨 override(없으면 kind). 알람선은 방향 화살표(≥ ↑ / ≤ ↓).
    color?: string; // 색 override(없으면 kind 색). 리졸버가 고른 기준선을 갈라 보이는 데 쓴다.
}

/** 이 차트(종목,날짜)의 모든 앵커. */
export const fetchChartAnchors = (code: string, date: string, signal?: AbortSignal): Promise<ChartAnchor[]> =>
    apiGet<ChartAnchor[]>("chart-anchors", { code, date }, signal);

/** 앵커 추가 — 같은 좌표 재추가는 멱등(서버가 기존 행 반환). param 규칙 검증은 서버(레지스트리). */
export const addChartAnchor = (anchor: AddChartAnchorInput): Promise<ChartAnchor> => apiPost<ChartAnchor>("chart-anchors", anchor);

/** 앵커 1개 삭제(id 지목). */
export const removeChartAnchor = (id: string): Promise<void> => apiDelete(`chart-anchors/${id}`);

/** 기준선(=선)이 하나라도 있는 (종목,날짜) 전부 — 월 그룹은 클라. 날짜 내림차순. */
export const fetchAnchoredCharts = (signal?: AbortSignal): Promise<AnchoredChart[]> => apiGet<AnchoredChart[]>("chart-anchors/stocks", undefined, signal);
