// core/market/domain — 당일 이슈 분류(편집 데이터). "이 날, 이 종목이, 이 이슈(촉매)로 움직였다".
// 종목의 정적 테마(정체성)는 Google Sheet(종목 History)에 있고, 여기엔 당일 드라이버만 담는다.
// issue 가 그룹 키: 같은 (date, issue) = 그날 같은 촉매로 같이 움직인 종목들.
// 편집은 행 단위 add/delete 두 연산뿐("수정"=삭제+추가)이라 id 가 필요 없다 — (date, stockCode, issue) 가 자연키.
// 영속 부기(created_at)는 도메인 관심사 아님 → 여기 없다(어댑터 경계의 것).

/**
 * 한 종목의 당일 이슈 한 건. 미정이면 issue 는 sentinel '미분류'.
 * 한 종목이 당일 2개 이슈면 DailyIssue 2개(같은 date·stockCode, 다른 issue).
 */
export interface DailyIssue {
    date: string; // YYYY-MM-DD (거래일)
    stockCode: string;
    issue: string; // 당일 촉매/테마. 그룹 키. 미정이면 '미분류'.
    comment?: string; // 당일 주석(선택)
    author: string; // 입력자(컨펌은 author 변경/삭제로 처리)
}
