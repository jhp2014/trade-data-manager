// /rank-axes 계약 — 순위 배치 큐레이션. 도메인 값타입(RankAxis·PlacedPoint)은 core/market 를 **재노출**(단일 출처).
// 저장된 것만 와이어를 타므로 id 는 항상 존재(RankAxis.id 필수). 요청 바디(point·target)는 컨트롤러/클라 로컬 정의.
import type { RankAxis, PlacedPoint } from "@trade-data-manager/market";

export type { RankAxis, PlacedPoint };
