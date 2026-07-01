// core/market/domain/review — 복기 타점(사람 편집). 차트에서 찍은 관찰 지점.
// 자연키 (stockCode, date, time) = caseId 삼중키(`{code}-{YYYY-MM-DD}[-{HHmm}]` 의 구성요소).
// 가설 유무와 무관하게 독립적으로 존재한다(먼저 있어야 hypothesis 가 붙일 대상이 됨).
// 타점의 "풍성한 의미"(가설·태그·관계·결과)는 하류 hypothesis 앱이 caseId 로 읽어 담당 →
// 여기선 가벼운 앵커 + memo 한 줄만(구조화 payload 는 두지 않는다).

/** 한 종목·거래일·시각의 복기 타점 1건. */
export interface ReviewPoint {
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
    memo?: string; // 타점 메모(선택)
}
