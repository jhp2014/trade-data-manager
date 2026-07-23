// 순위 필터 경로 조회 — 타점 집합(클라 밴드 AND 교집합)을 보내 진입 후 인트라데이 % 경로를 받는다.
// 저장분 아닌 임시 질의라 POST 바디. 응답 봉투(RankPointPath)는 contracts/wire 공유. horizon·분위·MFE/MAE 는 클라 계산.
import type { RankPointPath } from "@trade-data-manager/wire";
import { apiPost } from "./http.js";
import type { RankPoint } from "./rank.js";

export type { RankPointPath, RankPathBar } from "@trade-data-manager/wire";

export const fetchRankPaths = (points: RankPoint[]): Promise<RankPointPath[]> => apiPost<RankPointPath[]>("rank-paths", { points });
