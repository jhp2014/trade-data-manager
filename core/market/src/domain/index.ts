// 공용 값객체
export * from "./dateRange.js";

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

// classification — 종목 분류 두 레이어(정적 테마 정체성 + 당일 촉매)
export * from "./classification/themeMember.js";
export * from "./classification/dailyIssue.js";

// review — 차트 주석(사람 편집): 수평 가격선 + 복기 타점
export * from "./review/priceLine.js";
export * from "./review/reviewPoint.js";

// board — 테마 보드 순수 로직(로스터·포함관계·시점 유니버스 선정). 워크벤치 클라가 import.
export * from "./board/index.js";

// replay — 복기 파생 순수 계산(deriveMinutes·themeStatsOf) + 타입(MinuteDerived·ThemeStats·DayReplay).
export * from "./replay/dayReplay.js";
