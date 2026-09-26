// Daily 패널 주소 — 여러 자리(작업 대상·테마 판·조건판·격자판)가 가리키는 id 를 잎 모듈 하나에 둔다.
//
// 조건판은 옛 「집합 편성」의 **idBase·component 를 승계**한다(`filter-funnel` / `filterFunnel`) —
// 사용자 배치·프리셋의 자리가 그대로 새 패널이 되고, 두 패널 공존이 원리적으로 불가능해진다
// (테마 [조건]판의 `themeRank` 승계 선례). 이름과 뜻의 어긋남은 이 주석이 말한다.
export const DAILY_GEN_BASE = "filter-funnel";
export const DAILY_GEN_PANEL_ID = `${DAILY_GEN_BASE}-1`;
/** 격자판 밑동 — 조건판의 「돌파」 줄이 연동하는 판(인스턴스는 연동 맵이 가리킨다). */
export const DAILY_GRID_BASE = "daily-grid";
