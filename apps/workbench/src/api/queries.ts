// React Query 옵션 중앙화 — 쿼리 키·queryFn·staleTime 을 한 곳에서 만든다.
// 호출부마다 옵션을 직접 적으면 같은 키에 staleTime 이 어긋나거나(예전 all-points 60s vs ∞) invalidate 키 오타가 난다.
// 역사·주석 데이터는 사실상 불변 → staleTime ∞. 편집은 mutation 이 invalidate 로 갱신하므로 자동 refetch 불필요.
// queryFn 은 react-query 의 signal 을 fetch 로 넘겨 키 변경/언마운트 시 요청을 취소한다.
import { queryOptions } from "@tanstack/react-query";
import { fetchChart } from "./chart.js";
import { fetchDaySummary } from "./daySummary.js";
import { fetchPriceLines, fetchPriceLinedStocks } from "./priceLines.js";
import { fetchReviewPoints, fetchAllPoints } from "./reviewPoints.js";
import { fetchHypotheses, fetchHypothesisLinks, fetchHypothesisRelations } from "./hypotheses.js";
import { fetchHypothesisFilters } from "./hypothesisFilters.js";
import { fetchRankAxes, fetchAxisLine } from "./rank.js";
import { fetchRankPaths } from "./rankPaths.js";
import type { RankPoint } from "./rank.js";
import { fetchStocksMeta } from "./stocks.js";
import { fetchThemeContext } from "./themes.js";
import { fetchDailyComment } from "./comment.js";
import { fetchDataDates } from "./dataDates.js";
import { kstToday } from "../lib/date.js";

const IMMUTABLE = Infinity;
const META_STALE = 30 * 60_000; // 마스터 메타 — 미수집 코드가 sticky-null 로 굳지 않게 30분마다 재시도 허용
const TODAY_STALE = 60_000; // 오늘 시세 — 수집(20:30 스윕) 중 빈/부분 응답이 세션 내내 굳지 않게 1분 후 재조회 허용

// 시세 역사(chart·day-summary·day-replay)는 **과거 날짜만** 불변 — 오늘은 수집이 채우는 중일 수 있다.
// (주석/가설류는 날짜 무관하게 편집형이지만 mutation 이 invalidate 하므로 ∞ 유지.)
export const histStale = (date: string): number => (date < kstToday() ? IMMUTABLE : TODAY_STALE);

export const chartQuery = (code: string, date: string) =>
    queryOptions({ queryKey: ["chart", code, date], queryFn: ({ signal }) => fetchChart(code, date, signal), enabled: code.length > 0 && date.length > 0, staleTime: histStale(date) });

export const daySummaryQuery = (date: string) =>
    queryOptions({ queryKey: ["day-summary", date], queryFn: ({ signal }) => fetchDaySummary(date, signal), enabled: date.length > 0, staleTime: histStale(date) });

export const priceLinesQuery = (code: string, date: string) =>
    queryOptions({ queryKey: ["price-lines", code, date], queryFn: ({ signal }) => fetchPriceLines(code, date, signal), enabled: code.length > 0 && date.length > 0, staleTime: IMMUTABLE });

export const priceLinedStocksQuery = () =>
    queryOptions({ queryKey: ["price-lined-stocks"], queryFn: ({ signal }) => fetchPriceLinedStocks(signal), staleTime: IMMUTABLE });

export const reviewPointsQuery = (code: string, date: string) =>
    queryOptions({ queryKey: ["review-points", code, date], queryFn: ({ signal }) => fetchReviewPoints(code, date, signal), enabled: code.length > 0 && date.length > 0, staleTime: IMMUTABLE });

export const allPointsQuery = () =>
    queryOptions({ queryKey: ["all-points"], queryFn: ({ signal }) => fetchAllPoints(signal), staleTime: IMMUTABLE });

export const hypothesesQuery = () =>
    queryOptions({ queryKey: ["hypotheses"], queryFn: ({ signal }) => fetchHypotheses(signal), staleTime: IMMUTABLE });

export const hypothesisLinksQuery = () =>
    queryOptions({ queryKey: ["hypothesis-links"], queryFn: ({ signal }) => fetchHypothesisLinks(signal), staleTime: IMMUTABLE });

export const hypothesisRelationsQuery = () =>
    queryOptions({ queryKey: ["hypothesis-relations"], queryFn: ({ signal }) => fetchHypothesisRelations(signal), staleTime: IMMUTABLE });

// 저장된 가설 필터 목록. 저장/삭제 mutation 이 이 키를 invalidate 하므로 staleTime ∞.
export const hypothesisFiltersQuery = () =>
    queryOptions({ queryKey: ["hypothesis-filters"], queryFn: ({ signal }) => fetchHypothesisFilters(signal), staleTime: IMMUTABLE });

// 순위 배치 — 축 목록·축별 줄(placements). 편집형(place/unplace mutation 이 invalidate)이라 staleTime ∞.
export const rankAxesQuery = () =>
    queryOptions({ queryKey: ["rank-axes"], queryFn: ({ signal }) => fetchRankAxes(signal), staleTime: IMMUTABLE });

export const axisLineQuery = (axisId: string) =>
    queryOptions({ queryKey: ["rank-axis-line", axisId], queryFn: ({ signal }) => fetchAxisLine(axisId, signal), enabled: axisId.length > 0, staleTime: IMMUTABLE });

// 순위 필터 타점 집합의 진입 후 경로(파생). 키 = 정렬된 타점 pk 집합(순서 무관·재조회 방지). 역사 타점이라 staleTime ∞.
export const rankPathsQuery = (points: RankPoint[]) => {
    const keys = points.map((p) => `${p.stockCode}|${p.date}|${p.time}`).sort();
    return queryOptions({ queryKey: ["rank-paths", keys.join(",")], queryFn: () => fetchRankPaths(points), enabled: points.length > 0, staleTime: IMMUTABLE });
};

// 종목명 등 마스터 메타(날짜무관·code 키). 이름 하나 얻으려 큰 보드 응답을 안 당긴다.
export const stockMetaQuery = (code: string) =>
    queryOptions({ queryKey: ["stock-meta", code], queryFn: ({ signal }) => fetchStocksMeta([code], signal), enabled: code.length > 0, staleTime: META_STALE });

// 여러 종목명 배치 조회(/stocks/meta 는 codes 다중 지원) — 최근 탐색처럼 코드 목록의 이름을 한 번에 얻을 때.
// 키를 **정렬된 코드 집합**으로 잡아 재정렬(방문 시 맨 위로)엔 안 굴고, 새 코드가 들어올 때만 재조회.
export const stocksMetaQuery = (codes: string[]) => {
    const uniq = [...new Set(codes)].sort();
    return queryOptions({ queryKey: ["stocks-meta", uniq.join(",")], queryFn: ({ signal }) => fetchStocksMeta(uniq, signal), enabled: uniq.length > 0, staleTime: META_STALE });
};

// 종목의 시트 테마+편입이슈(날짜무관·code 키). 배정 mutation 이 ["theme-context"] invalidate 로 갱신하므로 staleTime ∞.
export const themeContextQuery = (code: string) =>
    queryOptions({ queryKey: ["theme-context", code], queryFn: ({ signal }) => fetchThemeContext(code, signal), enabled: code.length > 0, staleTime: IMMUTABLE });

// 당일 종목 코멘트(date+code 키) — 편집형이라 불변 아님. 저장 mutation 이 이 키를 invalidate 해 갱신하므로 staleTime 0.
export const dailyCommentQuery = (date: string, code: string) =>
    queryOptions({ queryKey: ["daily-comment", date, code], queryFn: ({ signal }) => fetchDailyComment(date, code, signal), enabled: date.length > 0 && code.length > 0, staleTime: 0 });

// 데이터 있는 거래일 목록(전역·종목무관) — data-aware 날짜피커용. 수집으로 새 날짜가 늘 수 있어 30분 stale 후 재조회 허용.
export const dataDatesQuery = () =>
    queryOptions({ queryKey: ["data-dates"], queryFn: ({ signal }) => fetchDataDates(signal), staleTime: META_STALE });
