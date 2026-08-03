// 차트 패널 파생 공용 — 복기(ChartPanel)·실시간(RealtimeChartPanel) 두 패널이 번들에서 뷰를 뽑는 규칙 한 벌.
//
// **소스는 공용화하지 않는다.** 복기는 chartQuery(DB, useChartHotkeys·RankFilterPanel 과 RQ 캐시 공유),
// 실시간은 useChartBundle("live")(REST 폴링). 키를 합치면 캐시 공유가 깨지므로 패널이 각자 고르고,
// **도착한 번들을 뷰로 만드는 부분**만 여기서 같이 쓴다.
import { useMemo } from "react";
import { anchorParamByKey, type AnchorCoord, type PointAnchor } from "@trade-data-manager/market/domain";
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

/** 타점 파라미터 앵커 선 색 — 가격선(D/M)·알람(A)과 갈라 보이게. */
export const ANCHOR_LINE_COLOR = "#0ea5e9";

/**
 * 앵커 선 id — 가격선 id 와 네임스페이스("anchor:")로 구분하고, **좌표까지** 담는다.
 * param 만 담으면 한 param 에 앵커가 여럿일 때(다중 파라미터) 선 둘이 같은 id 를 갖고 삭제가 엉뚱한 걸 지운다.
 * 구분자 "|" 는 param 키(레지스트리 kebab)·날짜·시각 어디에도 안 나온다.
 */
export const anchorLineId = (a: Pick<PointAnchor, "param" | "anchorDate" | "anchorTime">): string =>
    `anchor:${a.param}|${a.anchorDate}|${a.anchorTime ?? ""}`;

/** 앵커 선 id 되읽기 — 앵커 선이 아니거나 모양이 깨졌으면 null(호출자가 가격선으로 넘긴다). */
export function parseAnchorLineId(id: string): { param: string; coord: AnchorCoord } | null {
    if (!id.startsWith("anchor:")) return null;
    const [param, anchorDate, anchorTime] = id.slice("anchor:".length).split("|");
    if (!param || !anchorDate) return null;
    return { param, coord: { anchorDate, anchorTime: anchorTime || undefined } };
}

/**
 * 타점 파라미터 앵커 → 렌더선. 가격선과 달리 **저장된 시장(market)의 값**을 raw 번들에서 읽는다 —
 * 모드 뷰(dailyView)로 읽으면 차트 토글에 따라 값이 바뀌어 "사람이 지목한 그 값"이 아니게 된다
 * (KRX/UN 고가가 다르거나 NXT 오염 캔들을 피해 지목한 판단이 앵커의 존재 이유).
 * 가격 앵커(field+market)만 선이 된다 — 시각 앵커는 수평선으로 그릴 값이 없다(후속: 세로 마커).
 * 앵커 캔들이 로드 창 밖이면 그 선은 생략(가격선과 같은 규칙).
 */
export function resolvePointAnchorLines(
    anchors: readonly PointAnchor[],
    dailyBundle: ChartBundle | undefined,
    minuteBundle: ChartBundle | undefined,
): RenderLine[] {
    const out: RenderLine[] = [];
    for (const a of anchors) {
        if (!a.field || !a.market) continue; // 시각 앵커 — 선 아님
        const label = anchorParamByKey.get(a.param)?.name ?? a.param;
        if (a.anchorTime) {
            const m = minuteBundle?.minutes.find((c) => c.date === a.anchorDate && c.time === a.anchorTime);
            const bar = a.market === "krx" ? m?.krx : m?.un;
            if (bar) out.push({ id: anchorLineId(a), price: Number(bar[a.field]), kind: "M", label, color: ANCHOR_LINE_COLOR });
        } else {
            const d = dailyBundle?.daily.find((c) => c.date === a.anchorDate);
            const bar = a.market === "krx" ? d?.krx : d?.un;
            if (bar) out.push({ id: anchorLineId(a), price: Number(bar[a.field]), kind: "D", label, color: ANCHOR_LINE_COLOR });
        }
    }
    return out;
}
