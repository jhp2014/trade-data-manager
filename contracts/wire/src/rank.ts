// 축 어휘 재노출 — 도메인 값타입(RankAxis·PlacedPoint)은 core/market 이 단일 출처.
// 옛 판단 축 계약(축 CRUD·배치 place/unplace 입력)은 2026-08-25 폐지 — 남은 축은 계산 축뿐이고
// 그 피드는 rankComputed.ts, 줄(PlacedPoint[])은 클라가 값에서 조립한다.
import type { RankAxis, PlacedPoint } from "@trade-data-manager/market";

export type { RankAxis, PlacedPoint };
