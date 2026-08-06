// 골격 좌표 클라이언트 — 읽기 하나. 쓰기(피벗 찍기·지우기)는 차트의 앵커 경로(api/chartAnchors)다.
import type { SkeletonFeed } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { SkeletonFeed, SkeletonWireEntry, SkeletonWirePivot, SkeletonWireLevel, SkeletonWireLevels } from "@trade-data-manager/wire";

/** 전 타점의 골격 좌표(일봉·분봉 한 벌). 선택 필터링은 클라 — 선택이 바뀔 때마다 왕복하지 않는다. */
export const fetchSkeletons = (signal?: AbortSignal): Promise<SkeletonFeed> =>
    apiGet<SkeletonFeed>("skeletons", undefined, signal);
