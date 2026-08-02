// DI 토큰 — core/market 의 inbound 포트는 TS 인터페이스라 런타임에 소멸한다.
// Nest 가 타입으로 주입할 실체가 없으므로 Symbol 토큰으로 배선한다(타입기반 주입 미사용).
// core/market 은 이 토큰을 모른다 — 배선 지식은 전부 apps/api 가장자리에만 산다.
export const CHART_READER = Symbol("ChartReader");
export const DAY_BOARDS = Symbol("DayBoards");
export const MASTER_CACHE = Symbol("MasterCache");
export const MEMBERSHIP_CACHE = Symbol("MembershipCache");
export const THEME_MEMBERSHIP_STORE = Symbol("ThemeMembershipStore");
export const PRICE_LINE_REPO = Symbol("PriceLineRepository");
export const REVIEW_POINT_REPO = Symbol("ReviewPointRepository");
export const DAILY_COMMENTS = Symbol("DailyComments");          // 코멘트 유스케이스(빈값=삭제·author 소유)
export const THEME_ASSIGNMENT = Symbol("ThemeAssignment");      // 테마 배정 유스케이스(중복 skip·캐시 무효화)
export const RANK_REPO = Symbol("RankRepository");
export const TAG_REPO = Symbol("TagRepository");
export const RANK_MINUTES = Symbol("RankMinutes");
export const COMPUTED_AXES = Symbol("ComputedAxes");      // 계산 축 값(타점→수치) 읽기모델 + 파일 캐시
export const STOCK_NEWS_REPO = Symbol("StockNewsRepository");
export const NEWS_SEARCHER = Symbol("NewsSearcher");
export const MARKET_POOL = Symbol("MarketPool");
export const CURATION_POOL = Symbol("CurationPool");
export const DATA_DATE_READER = Symbol("DataDateReader");
