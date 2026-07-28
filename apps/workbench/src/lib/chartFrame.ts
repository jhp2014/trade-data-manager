// 차트 패널 파생 공용 — 복기(ChartPanel)·실시간(RealtimeChartPanel) 두 패널이 번들에서 뷰를 뽑는 규칙 한 벌.
//
// **소스는 공용화하지 않는다.** 복기는 chartQuery(DB, useChartHotkeys·RankFilterPanel 과 RQ 캐시 공유),
// 실시간은 useChartBundle("live")(REST 폴링). 키를 합치면 캐시 공유가 깨지므로 패널이 각자 고르고,
// **도착한 번들을 뷰로 만드는 부분**만 여기서 같이 쓴다.
import { useMemo } from "react";
import { deriveDailyView, deriveMinuteView, prevCloseAsOf, type DailyPoint, type MinuteView } from "./derive.js";
import type { ChartBundle } from "../api/chart.js";
import type { RenderLine } from "../api/priceLines.js";
import type { ChartPriceMode } from "../store/workbench.js";

export interface ChartViews {
    dailyView: DailyPoint[] | null;
    minuteView: MinuteView | null;
    /** 일봉 리프레임 게이트 — 아래 주석 참조. */
    dailyFrameKey: string;
    minuteFrameKey: string;
    /** 검색일 전일종가(수정주가, mode 시장) — 크로스헤어 %·+30% 가이드선의 분모. */
    pctBase: number | null;
}

/**
 * 번들 → 뷰 + 리프레임 키 + % base.
 *
 * frameKey 는 focus 가 아니라 **도착한 데이터**에서 파생한다: placeholder/이전 데이터를 보여주는
 * 동안엔 값이 안 바뀌어 리프레임이 없고, 새 번들이 실제로 도착하는 순간 바뀌어 그때 한 번만
 * 리프레임된다(스케일 고정 ON 이면 창 유지). 실시간 폴링은 같은 값이라 게이트를 통과 못 해 뷰가 보존된다.
 */
export function useChartViews(
    dailyBundle: ChartBundle | undefined,
    minuteBundle: ChartBundle | undefined,
    mode: ChartPriceMode,
    viewDate: string,
): ChartViews {
    const dailyView = useMemo(() => (dailyBundle ? deriveDailyView(dailyBundle, mode) : null), [dailyBundle, mode]);
    const minuteView = useMemo(() => (minuteBundle ? deriveMinuteView(minuteBundle, mode) : null), [minuteBundle, mode]);
    const dailyFrameKey = dailyBundle ? `${dailyBundle.stockCode}:${dailyBundle.daily[dailyBundle.daily.length - 1]?.date ?? ""}` : "";
    const minuteFrameKey = minuteBundle ? `${minuteBundle.stockCode}:${minuteBundle.minutes[0]?.date ?? ""}` : "";
    const pctBase = useMemo(() => (dailyView ? prevCloseAsOf(dailyView, viewDate) : null), [dailyView, viewDate]);
    return { dailyView, minuteView, dailyFrameKey, minuteFrameKey, pctBase };
}

/** 일봉 앵커에서 읽을 값. 가격선이 저장하는 field 와 같은 집합. */
type DailyField = "open" | "high" | "low" | "close";

/**
 * 가격선 앵커 — 값(가격)이 아니라 **캔들 좌표**를 저장한다(수정주가 재계산에 안 흔들리게).
 * 복기는 서버 저장(curation.price_lines), 실시간은 메모리(store liveLines) — 저장소는 달라도 모양은 같다.
 */
export interface ChartLineAnchor {
    id: string;
    anchorDate: string;
    /** 있으면 분봉(M) 앵커, 없으면 일봉(D) 앵커. */
    anchorTime?: string | null;
    /** 일봉 앵커에서 읽을 값(기본 high). 분봉 앵커는 항상 고가. */
    field?: DailyField;
}

/**
 * 앵커 → 렌더선. 지금 로드된 캔들에서 값을 읽어 수평선 가격을 만든다.
 * 앵커 캔들이 화면 데이터에 없으면 **그 선은 생략** — 없는 좌표를 0 이나 추정값으로 그리지 않는다.
 */
export function resolveAnchorLines(
    anchors: readonly ChartLineAnchor[],
    dailyView: DailyPoint[] | null,
    minuteView: MinuteView | null,
): RenderLine[] {
    if (!dailyView || !minuteView) return [];
    const dailyByDate = new Map(dailyView.map((p) => [p.time, p] as const));
    const minuteByKey = new Map(minuteView.points.map((p) => [`${p.date}T${p.tradeTime}`, p] as const));
    const out: RenderLine[] = [];
    for (const a of anchors) {
        if (a.anchorTime) {
            const mp = minuteByKey.get(`${a.anchorDate}T${a.anchorTime}`);
            if (mp) out.push({ id: a.id, price: mp.highPrice, kind: "M" });
        } else {
            const dp = dailyByDate.get(a.anchorDate);
            if (dp) out.push({ id: a.id, price: dp[a.field ?? "high"], kind: "D" });
        }
    }
    return out;
}
