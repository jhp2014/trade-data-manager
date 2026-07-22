// 순위 배치 큐레이션 CRUD 클라이언트. wire 타입(RankAxis·PlacedPoint)은 contracts/wire 공유.
// 한 축 피드(PlacedPoint[])를 받아 패널이 slotId 로 묶어 타이 셀, orderKey 로 정렬(옵션 A). 대상 타점 = review point 삼중키.
import type { RankAxis, PlacedPoint } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiDelete } from "./http.js";

export type { RankAxis, PlacedPoint } from "@trade-data-manager/wire";

/** 배치 대상 타점 자연키. */
export interface RankPoint {
    stockCode: string;
    date: string;
    time: string;
}

/** 드롭 목표 — 기존 slot 합류(타이) | 두 slot 사이 새 slot(양끝 없으면 끝단). */
export type RankTarget =
    | { kind: "slot"; slotId: string }
    | { kind: "between"; prevSlotId?: string; nextSlotId?: string };

export const fetchRankAxes = (signal?: AbortSignal): Promise<RankAxis[]> => apiGet<RankAxis[]>("rank-axes", undefined, signal);

export const fetchAxisLine = (axisId: string, signal?: AbortSignal): Promise<PlacedPoint[]> =>
    apiGet<PlacedPoint[]>(`rank-axes/${axisId}/placements`, undefined, signal);

export const createRankAxis = (name: string): Promise<RankAxis> => apiPost<RankAxis>("rank-axes", { name });

export const renameRankAxis = (id: string, name: string): Promise<void> => apiPatch(`rank-axes/${id}`, { name });

export const deleteRankAxis = (id: string): Promise<void> => apiDelete(`rank-axes/${id}`);

export const placePoint = (axisId: string, point: RankPoint, target: RankTarget): Promise<{ slotId: string; orderKey: number }> =>
    apiPost<{ slotId: string; orderKey: number }>(`rank-axes/${axisId}/placements`, { ...point, target });

export const unplacePoint = (axisId: string, point: RankPoint): Promise<void> =>
    apiDelete(`rank-axes/${axisId}/placements`, { code: point.stockCode, date: point.date, time: point.time });
