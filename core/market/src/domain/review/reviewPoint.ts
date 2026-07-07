// core/market/domain/review — 복기 타점(사람 편집). 차트에서 찍은 관찰 지점.
// 자연키 (stockCode, date, time) 삼중키(시각 필수). **옛 caseId/case 개념을 흡수 = 이 타점이 곧 case.**
// type(셋업 유형: 돌파/눌림…)·outcome(트레이드 결과)·memo 는 타점 자체의 큐레이션 속성.
// 가설(hypothesis)은 이 타점을 자연키로 참조하는 하류 — 가설·관계는 curation.hypotheses 쪽이 담당.

/** 한 종목·거래일·시각의 복기 타점 1건. */
export interface ReviewPoint {
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
    type?: string; // 셋업 유형 라벨(선택). 값·트리는 클라 config(느슨한 varchar).
    outcome?: string; // 트레이드 결과(선택, 가설 무관). 허용값은 클라.
    memo?: string; // 타점 메모(선택)
}

/** 복기 타점 1건 + 종목명 — 월별 타점 목록(작업셋)용 read model. name 은 stock_master 조인 파생(미등록 null). */
export interface ReviewPointListItem extends ReviewPoint {
    name: string | null;
}
