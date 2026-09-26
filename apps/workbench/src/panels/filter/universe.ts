// 우주(universe) — 2026-09-26 종단 트랙 전면 폐기로 **개념째 은퇴**했다(모드·결손 지도·파생 규칙 전부).
// 남은 것은 저장물 승계용 최소 조각뿐이다: SavedSet.universe 필드는 롤백 한 사이클 동안 "daily" 로
// 계속 기록되고(옛 코드는 부재를 종단으로 읽는다 — decisions 「저장물 모양이 바뀌는 커밋은 하나로」),
// parseUniverse 는 이주(종단 집합 폐기)가 옛 값을 읽는 자다.
export type Universe = "longitudinal" | "daily";

/** 저장물 승계 — 부재·오염은 **종단**(우주 선언이 없던 시절 저장물의 행동 그대로 → 이주가 폐기한다). */
export const parseUniverse = (v: unknown): Universe => (v === "daily" ? "daily" : "longitudinal");
