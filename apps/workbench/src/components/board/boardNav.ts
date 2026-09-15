import type { MutableRefObject } from "react";

// 보드가 w/s 순회의 후보가 되는 조건 — **순회 함수를 얹을 자리**(navRef)와 도착한 종목을 **어떻게 고르나**(pick).
//
// ⚠ publish 는 **패널 최상단**이 진다(시트의 RankSheetPanel→SheetBody 와 같은 모양). 본문(BoardLayout·
// FlatStockList)에서 얹으면 데이터 로딩의 조기 반환마다 후보 자격이 깜빡이고, 그 창에서 누른 w/s 가
// 다른 패널(우선순위 폴백)로 새어 전역 Focus 를 끌고 간다 — 날짜를 바꿀 때마다 열리는 창이라 실제로 난다.
//
// pick 이 별도인 이유: 순회는 보드 제 출처(selfOrigin)가 아니라 **바깥 출처**로 Focus 를 옮겨야
// 그 종목의 카드가 승격·스크롤된다(BoardLayout) — 걸었는데 어디 갔는지 안 보이면 순회가 아니다.
export interface BoardNav {
    navRef: MutableRefObject<(dir: 1 | -1) => void>;
    pick: (code: string) => void;
}
