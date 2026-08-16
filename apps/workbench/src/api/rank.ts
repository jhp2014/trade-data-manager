// 순위 배치 큐레이션 CRUD 클라이언트. wire 타입(RankAxis·AxisLine·PlacedPoint)은 contracts/wire 공유.
// 전 축 피드(AxisLine[])를 받아 패널이 **orderKey 로 묶어 타이 셀**, 같은 키로 정렬(옵션 A).
//
// **축은 이름으로, 자리는 타점으로 지목한다.** id 는 계약을 안 건넌다(로컬 미러와 Supabase 가 각자
// 발급 → 동기화를 건넌 참조가 다른 행을 가리킨다). slot 은 이름이 없고 order_key 는 reindex 가 다시
// 쓰는 값이라, 자리를 가리키는 유일하게 안정된 손잡이가 "그 자리에 있는 타점"이다.
import type { RankAxis, AxisLine, ComputedAxisFeed, RankPoint, RankTarget } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch } from "./http.js";

export type { RankAxis, AxisLine, PlacedPoint, ComputedAxisFeed, RankPoint, RankTarget } from "@trade-data-manager/wire";

export const fetchRankAxes = (signal?: AbortSignal): Promise<RankAxis[]> => apiGet<RankAxis[]>("rank-axes", undefined, signal);

/** 전 축의 줄 한 방(축 단건 조회 없음 — 소비자가 모두 전축을 본다). 배치 0인 축은 응답에 없음 = 빈 줄. */
export const fetchAxisLines = (signal?: AbortSignal): Promise<AxisLine[]> => apiGet<AxisLine[]>("rank-axes/placements", undefined, signal);

/** 계산 축 피드 — 값만(배치 없음). 줄 세우기·순위는 클라가 한다(lib/computedAxis). 쓰기 엔드포인트 없음. */
export const fetchComputedAxes = (signal?: AbortSignal): Promise<ComputedAxisFeed[]> =>
    apiGet<ComputedAxisFeed[]>("rank-axes/computed", undefined, signal);

export const createRankAxis = (name: string, scope: "point" | "day" = "point"): Promise<RankAxis> => apiPost<RankAxis>("rank-axes", { name, scope });

export const renameRankAxis = (name: string, newName: string): Promise<void> => apiPatch("rank-axes/rename", { name, newName });

export const deleteRankAxis = (name: string): Promise<void> => apiPost("rank-axes/remove", { name }).then(() => undefined);

export const placePoint = (axis: string, point: RankPoint, target: RankTarget): Promise<{ orderKey: number }> =>
    apiPost<{ orderKey: number }>("rank-axes/placements", { axis, point, target });

export const unplacePoint = (axis: string, point: RankPoint): Promise<void> =>
    apiPost("rank-axes/placements/remove", { axis, point }).then(() => undefined);
