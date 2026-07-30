// core/market/domain/review — 복기 타점(사람 편집). 차트에서 찍은 관찰 지점.
// 자연키 (stockCode, date, time) 삼중키(시각 필수). **옛 caseId/case 개념을 흡수 = 이 타점이 곧 case.**
// outcome(트레이드 결과)·memo 는 타점 자체의 큐레이션 속성.
// 셋업 유형(돌파/눌림…)은 단일 varchar `type` 이었다가 **태그로 이관**(domain/review/tag.ts) — 원래 다중이어야 할
// 명목형 분류를 한 칸에 눌러 담고 있었고, 그래서 순서 없는 분류를 순위 축의 배치 유무로 대신 표현하는 우회까지 낳았다.
// 순위 배치(curation.rank_placements)가 이 타점을 자연키로 참조하는 하류.

/**
 * 타점 자연키 삼중키 — 하류(순위 배치·태그)가 타점을 지목할 때 쓰는 최소 식별자.
 * 큐레이션 속성(outcome·memo) 없이 "어느 타점이냐"만 말한다.
 */
export interface ReviewPointKey {
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
}

/** 한 종목·거래일·시각의 복기 타점 1건. */
export interface ReviewPoint extends ReviewPointKey {
    outcome?: string; // 트레이드 결과(선택). 허용값은 클라.
    memo?: string; // 타점 메모(선택)
}

/** 복기 타점 1건 + 종목명 — 월별 타점 목록(작업셋)용 read model. name 은 app 레이어가 stock_master 로 붙인다(미등록 null). */
export interface ReviewPointListItem extends ReviewPoint {
    name: string | null;
}
