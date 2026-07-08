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
export const DAILY_COMMENT_REPO = Symbol("DailyCommentRepository");
export const HYPOTHESIS_REPO = Symbol("HypothesisRepository");
export const STOCK_NEWS_REPO = Symbol("StockNewsRepository");
export const NEWS_SEARCHER = Symbol("NewsSearcher");
export const MARKET_POOL = Symbol("MarketPool");
export const DATA_DATE_READER = Symbol("DataDateReader");
