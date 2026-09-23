// 공용 값객체
export * from "./grain.js";
export * from "./dateRange.js";
export * from "./kst.js";
export * from "./stockCode.js";

// candle — 일·분봉 OHLCV + 그 위 순수계산(등락률·거래대금·dense·후보선정)
export * from "./candle/model.js";
export * from "./candle/price.js";
export * from "./candle/pruning.js";
export * from "./candle/minuteBackfill.js";

// equity — 종목 자체 속성(이름·상장일·공모가·시총·발행)
export * from "./equity/stockMaster.js";
export * from "./equity/dailyStockStat.js";
export * from "./equity/ipoPrice.js";

// news — 외부 텍스트 이벤트(저장 헤드라인 / 라이브 검색)
export * from "./news/news.js";
export * from "./news/newsSearch.js";

// classification — 정적 테마 정체성(시트) + 당일 종목 코멘트(사람 편집)
export * from "./classification/themeMember.js";
export * from "./classification/dailyComment.js";

// review — 차트 주석(사람 편집): 차트 앵커(선+파라미터 앵커 통합) + 골격(피벗 시퀀스) + 복기 타점 + 타점 그룹
//   + 후보 하루(그 주석들이 정의하는 **분석의 모수**)
export * from "./review/chartAnchor.js";
export * from "./review/reviewPoint.js";
export * from "./review/group.js";
// 후보 하루를 모수로 삼는 필터 깔때기의 정산(3치 AND 하나 — 5칸 진단은 2026-09-19 은퇴).
export * from "./review/funnel.js";

// probe/probe.ts 는 **배럴에서 뺐다** — cellset 으로 이주를 마쳤고, 남은 유일한 소비자가
// 이주 등가 게이트(cellset/__tests__/equivalence.test.ts)라 앱이 실수로 집어 쓸 자리를 없앤다.
// 파일 자체는 그 게이트가 읽을 **동결된 참조 구현**으로만 남는다(② 합류 때 게이트와 함께 걷는다).

// cellset — **하루·셀 우주**(그날 전 (종목,분))의 조건 어휘·평가 엔진·시드.
// "후보 로직"이라는 개념이 없다: 조건 묶음 한 칸이 곧 로직이고, 로직 추가는 조건 저장이다.
export * from "./cellset/predicate.js";
export * from "./cellset/engine.js";
export * from "./cellset/seed.js";

// grid — 자동 타점 격자(순수 검출): 확정 고점·구간 저점 피벗 + 신고가 캔들 목록 + 기준선 첫 터치. Point 판정은 읽기 층(points).
// codec = 와이어 튜플 인코딩(서버 인코드·클라 디코드가 같은 한 벌).
export * from "./grid/grid.js";
export * from "./grid/fold.js";
export * from "./grid/levelView.js";
export * from "./grid/invariants.js";
export * from "./grid/points.js";
export * from "./grid/codec.js";
export * from "./grid/windows.js";
export * from "./grid/outcome.js";
export * from "./grid/simulate.js";

// rank — 축 어휘(계산 축의 메타·줄 항목) + 진입가 경로(rankPath). 옛 순위 배치(사람 편집)는 2026-08-25 폐지.
export * from "./rank/index.js";


// board — 테마 보드 순수 로직(로스터·포함관계·시점 유니버스 선정). 워크벤치 클라가 import.
export * from "./board/index.js";

// replay — 복기 파생 순수 계산(deriveMinutes·themeStatsOf) + 타입(MinuteDerived·ThemeStats·DayReplay).
export * from "./replay/dayReplay.js";
// 순위 단면 — (날짜,분) 전 종목 서수(rankSectionOf·descendingOrdinals·lastIndexAtOrBefore). 서버 캐시·클라 즉석 계산의 단일 자.
export * from "./replay/rankSection.js";
