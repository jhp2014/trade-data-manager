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
export * from "./equity/marketCap.js";
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
// 후보 하루를 모수로 삼는 필터 깔때기의 정산(단계 독립 평가 · 3치 AND · 5칸 · 한계 기여도).
export * from "./review/funnel.js";

// rank — 축 어휘(계산 축의 메타·줄 항목) + 진입가 경로(rankPath). 옛 순위 배치(사람 편집)는 2026-08-25 폐지.
export * from "./rank/index.js";


// board — 테마 보드 순수 로직(로스터·포함관계·시점 유니버스 선정). 워크벤치 클라가 import.
export * from "./board/index.js";

// replay — 복기 파생 순수 계산(deriveMinutes·themeStatsOf) + 타입(MinuteDerived·ThemeStats·DayReplay).
export * from "./replay/dayReplay.js";
