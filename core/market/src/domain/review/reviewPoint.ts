// core/market/domain/review — 복기 타점(사람 편집). 차트에서 찍은 관찰 지점.
// 자연키 (stockCode, date, time) 삼중키(시각 필수). **옛 caseId/case 개념을 흡수 = 이 타점이 곧 case.**
// outcome(트레이드 결과)·memo 는 타점 자체의 큐레이션 속성.
// 셋업 유형(돌파/눌림…)은 단일 varchar `type` 이었다가 **그룹으로 이관**(domain/review/group.ts) — 원래 다중이어야 할
// 명목형 분류를 한 칸에 눌러 담고 있었고, 그래서 순서 없는 분류를 순위 축의 배치 유무로 대신 표현하는 우회까지 낳았다.
// 순위 배치(curation.rank_placements)가 이 타점을 자연키로 참조하는 하류.

/**
 * 타점 자연키 삼중키 — 하류(순위 배치·그룹)가 타점을 지목할 때 쓰는 최소 식별자.
 * 큐레이션 속성(outcome·memo) 없이 "어느 타점이냐"만 말한다.
 */
export interface ReviewPointKey {
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
}

/**
 * 타점 키 직렬화 — `stockCode|date|time`. 캐시 키·맵 키·DOM data-* 가 전부 이 형식을 쓴다.
 * 구분자 `|` 는 종목코드(영숫자)·날짜·시각 어디에도 안 나온다. **여기가 유일한 정의다** — 리졸버·캐시·클라가
 * 각자 문자열을 조립하면 구분자 계약이 흩어져 한 곳만 바뀌는 사고가 난다(4곳 중복을 걷어낸 자리).
 */
export const pointKeyOf = (p: ReviewPointKey): string => `${p.stockCode}|${p.date}|${p.time}`;

/** 차트 키 직렬화 — `stockCode|date`. 차트(종목,날짜) grain 의 맵 키. pointKeyOf 와 같은 계약. */
export const chartKeyOf = (c: { stockCode: string; date: string }): string => `${c.stockCode}|${c.date}`;

/** 한 종목·거래일·시각의 복기 타점 1건. */
export interface ReviewPoint extends ReviewPointKey {
    outcome?: string; // 트레이드 결과(선택). 허용값은 클라.
    memo?: string; // 타점 메모(선택)
}

/**
 * 복기 타점 1건 + 종목명 — 월별 타점 목록(작업셋)용 read model. name 은 app 레이어가 stock_master 로
 * 붙인다(미등록 null).
 *
 * ⚠ **워크벤치는 이 name 을 읽지 않는다.** 종목명의 단일 출처는 클라가 부팅에 받는 마스터 사전
 * (`/stocks/master` → StockNamesContext)이다. 이 필드는 그 이전 방식의 잔재이며, 같은 마스터에서
 * 나온 **부분집합**이라 더 알려주는 것도 없다. 화면에서 `p.name` 을 쓰면 대개 맞고 가끔 비는데
 * (그 종목이 이 피드에 없을 때) — 그게 정확히 사전을 도입해 없앤 버그다. 이름은 사전에서만 얻는다.
 */
export interface ReviewPointListItem extends ReviewPoint {
    name: string | null;
}
