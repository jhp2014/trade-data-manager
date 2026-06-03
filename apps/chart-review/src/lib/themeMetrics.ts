/**
 * 테마 오버레이 시리즈(useChartPreview 응답)에서 사이드바 테마 리스트가 쓰는
 * 멤버별 스냅샷 메트릭을 계산하는 순수 함수.
 *
 * - 별도 DB 조회 없이 이미 받아둔 overlaySeries 만으로 계산한다.
 * - markerTime(진입 분) 시점까지의 누적/고가/구간 카운트를 산출한다.
 * - markerTime 이 null(입력 대기 타점)이면 시리즈 마지막(장 마감) 시점을 사용한다.
 */

import type { ChartOverlayPoint, ChartOverlaySeries } from "@/types/chart";
import type { ChartPriceMode } from "@/stores/useUiStore";
import { AMOUNT_KRW_TO_EOK } from "@/lib/constants";

export type ThemeMemberMetric = {
  stockCode: string;
  stockName: string;
  isSelf: boolean;
  /** 같은 거래일의 review_target 이고 Point List(≥1 point) 보유면 true. 배지(채움)용. */
  hasReview: boolean;
  /** 같은 거래일의 review_target 이면 true(포인트 0개여도). 배지(외곽선)용. */
  isReviewTarget: boolean;
  /** markerTime 시점 등락률(%). 데이터 없으면 null */
  rate: number | null;
  /** markerTime 까지의 최고 등락률(%). 데이터 없으면 null */
  dayHighRate: number | null;
  /** markerTime 시점 누적 거래대금(원) */
  cumAmount: number;
  /** markerTime 시점 분봉 거래대금(원) */
  amount: number;
  /** 임계값(억) → markerTime 까지 그 이상 분봉이 나온 횟수 */
  distribution: Record<number, number>;
};

function valueOf(point: ChartOverlayPoint, mode: ChartPriceMode): number {
  return mode === "nxt" ? point.valueNxt : point.valueKrx;
}

/** time <= markerTime 인 마지막 인덱스. markerTime 이 null 이면 마지막 인덱스. */
function indexAt(points: ChartOverlayPoint[], markerTime: number | null): number {
  if (points.length === 0) return -1;
  if (markerTime == null) return points.length - 1;
  let idx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].time <= markerTime) idx = i;
    else break;
  }
  return idx;
}

export function computeThemeMemberMetrics(
  series: ChartOverlaySeries[],
  markerTime: number | null,
  mode: ChartPriceMode,
  thresholdsEok: readonly number[],
): ThemeMemberMetric[] {
  return series.map((s) => {
    const points = s.series;
    const idx = indexAt(points, markerTime);

    const distribution: Record<number, number> = {};
    for (const t of thresholdsEok) distribution[t] = 0;

    if (idx < 0) {
      return {
        stockCode: s.stockCode,
        stockName: s.stockName,
        isSelf: s.isSelf,
        hasReview: s.hasReview ?? false,
        isReviewTarget: s.isReviewTarget,
        rate: null,
        dayHighRate: null,
        cumAmount: 0,
        amount: 0,
        distribution,
      };
    }

    let dayHigh = -Infinity;
    for (let i = 0; i <= idx; i++) {
      const v = valueOf(points[i], mode);
      if (v > dayHigh) dayHigh = v;
      const amtEok = points[i].amount / AMOUNT_KRW_TO_EOK;
      for (const t of thresholdsEok) {
        if (amtEok >= t) distribution[t] += 1;
      }
    }

    const cur = points[idx];
    return {
      stockCode: s.stockCode,
      stockName: s.stockName,
      isSelf: s.isSelf,
      hasReview: s.hasReview ?? false,
      isReviewTarget: s.isReviewTarget,
      rate: valueOf(cur, mode),
      dayHighRate: dayHigh === -Infinity ? null : dayHigh,
      cumAmount: cur.cumAmount,
      amount: cur.amount,
      distribution,
    };
  });
}

/** 등락률 내림차순(데이터 없는 종목은 뒤로). 상위 limit 개. */
export function topByRate(metrics: ThemeMemberMetric[], limit: number): ThemeMemberMetric[] {
  return [...metrics]
    .sort((a, b) => {
      if (a.rate == null && b.rate == null) return 0;
      if (a.rate == null) return 1;
      if (b.rate == null) return -1;
      return b.rate - a.rate;
    })
    .slice(0, limit);
}
