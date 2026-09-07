// 시트 패널 id — 카탈로그와 **순회 소유권 판정**(lib/rowNav)이 같은 주소를 본다.
// 잎 모듈인 이유: 소유권 훅이 패널 컴포넌트를 물면 App 단축키 한 줄이 시트 패널 전체를 import 한다
// (OUTCOME_PANEL_ID·TRADE_SIM_PANEL_ID 와 같은 처방).
// ⚠ 단일 인스턴스 전제 — 카탈로그에 rank-sheet-1 하나뿐이고, 순회 프로바이더도 모듈 전역 단일 소유다
//   (useSessionScroll 이 이미 같은 전제를 못박아 뒀다). 시트가 둘이 되면 둘 다 panelId 를 받아야 한다.
export const RANK_SHEET_PANEL_ID = "rank-sheet-1";
