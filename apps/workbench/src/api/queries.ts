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

const IMMUTABLE = Infinity;

export const chartQuery = (code: string, date: string) =>
    queryOptions({ queryKey: ["chart", code, date], queryFn: ({ signal }) => fetchChart(code, date, signal), enabled: code.length > 0 && date.length > 0, staleTime: IMMUTABLE });

export const daySummaryQuery = (date: string) =>
    queryOptions({ queryKey: ["day-summary", date], queryFn: ({ signal }) => fetchDaySummary(date, signal), enabled: date.length > 0, staleTime: IMMUTABLE });

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
