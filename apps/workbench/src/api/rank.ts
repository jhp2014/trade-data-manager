// 계산 축 피드 클라이언트 — 값만 온다(배치 없음). 줄 세우기·순위는 클라가 한다(lib/computedAxis).
// 쓰기 엔드포인트 없음: 쓰기 = curation 입력(앵커·타점 편집)이고 서버가 캐시를 자동 무효화한다.
// (옛 판단 축 CRUD·place/unplace 클라이언트는 2026-08-25 판단축 폐지로 삭제.)
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { apiGet } from "./http.js";

export type { RankAxis, PlacedPoint, ComputedAxisFeed } from "@trade-data-manager/wire";

export const fetchComputedAxes = (signal?: AbortSignal): Promise<ComputedAxisFeed[]> =>
    apiGet<ComputedAxisFeed[]>("rank-axes/computed", undefined, signal);
