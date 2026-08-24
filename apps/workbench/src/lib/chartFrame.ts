// 차트 패널 파생 공용 — 복기(ChartPanel)·실시간(RealtimeChartPanel) 두 패널이 번들에서 뷰를 뽑는 규칙 한 벌.
//
// **소스는 공용화하지 않는다.** 복기는 chartQuery(DB, useChartHotkeys·RankFilterPanel 과 RQ 캐시 공유),
// 실시간은 useChartBundle("live")(REST 폴링). 키를 합치면 캐시 공유가 깨지므로 패널이 각자 고르고,
// **도착한 번들을 뷰로 만드는 부분**만 여기서 같이 쓴다.
import { useMemo } from "react";
import { anchorCoordKey, BASELINE_PARAM, beatsAsBaseline, candlePrice, chartAnchorKey, type ChartAnchor } from "@trade-data-manager/market/domain";
import { deriveDailyView, deriveMinuteView, prevCloseAsOf, type DailyPoint, type MinuteView } from "./derive.js";
import type { ChartBundle } from "../api/chart.js";
import type { ChartPriceMode } from "../store/workbench.js";

/** 차트 렌더용 — 앵커를 로드된 캔들에서 해소한 결과. 차트 컴포넌트는 이것만 안다(와이어 아님, 클라 뷰모델 —
 * 그래서 api/ 가 아니라 여기 산다. api/ 는 와이어 계약 자리다). */
export interface RenderLine {
    /**
     * 손잡이 — 화면 안에서만 도는 값이다(서버로 안 나간다).
     * 복기 앵커는 **좌표 전체**(chartAnchorKey): DB id 는 계약을 안 건너므로(로컬↔원격에서 갈린다) 못 쓴다.
     * 실시간 선은 메모리 저장이라 클라가 만든 자체 id 를 그대로 쓴다(ChartLineAnchor.id).
     */
    id: string;
    price: number; // 해소된 raw 가격(원)
    kind: "D" | "M" | "A"; // 일봉/분봉 앵커(주석) 또는 A=알람 가격조건 — 색·%분모(D=전일종가, M=당일 기준가)
    label?: string; // 축 라벨 override(없으면 kind). 알람선은 방향 화살표(≥ ↑ / ≤ ↓).
    color?: string; // 색 override(없으면 kind 색). 리졸버가 고른 기준선을 갈라 보이는 데 쓴다.
}

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

/**
 * 선 하나의 % 좌표(분봉 % 축) — **분자·분모 스케일 일치**가 규칙.
 * D(일봉 앵커)는 수정주가로 해소되므로 분모도 수정주가 전일종가(pctBase),
 * M(분봉 고가)·A(알람 라이브 가격)는 당일 원주가이므로 분모도 원주가 base.
 * 분모 없으면 null — 그 선은 그리지도 맞히지도 않는다(지어낸 자리에 선을 세우지 않는다).
 * RenderLine 의 집이 여기라 규칙도 여기 산다 — 렌더(usePercentPriceLines)와 우클릭 판정이 같은 함수를 탄다.
 */
export function linePct(line: RenderLine, base: number | null, pctBase: number | null): number | null {
    const denom = line.kind === "D" ? pctBase : base;
    if (!denom || denom <= 0) return null;
    return ((line.price - denom) / denom) * 100;
}

/** target 이하(≤) 마지막 봉 시각으로 스냅 — 타점 세로선이 실제 봉 위에 서게. 이전 봉이 없으면 null.
 *  `bars` 는 시간 오름차순(차트 데이터가 전부 그렇다). */
export function snapToBar(bars: readonly { time: number }[], target: number | null): number | null {
    if (target == null) return null;
    let snapped: number | null = null;
    for (const b of bars) {
        if (b.time <= target) snapped = b.time;
        else break;
    }
    return snapped;
}

/**
 * target 이하(≤) **마지막 봉 인덱스** — a/d 이동·f 줌 앵커가 같은 규칙을 탄다.
 * 전부 target 보다 뒤(target 이 첫 봉보다 이전)면 **0(첫 봉)** — 마지막 봉으로 튀지 않는다
 * (예전엔 기본값 length-1 이 남아 세션 끝으로 점프했다). 빈 배열이면 -1.
 * `bars` 는 시간 오름차순(차트 데이터가 전부 그렇다). 키는 unix초든 "HH:MM:SS" 든 비교 가능하면 된다.
 */
export function indexAtOrBefore<T>(bars: readonly T[], target: number | string, keyOf: (b: T) => number | string): number {
    if (bars.length === 0) return -1;
    if (keyOf(bars[0]) > target) return 0;
    let idx = 0;
    for (let i = 0; i < bars.length; i++) {
        if (keyOf(bars[i]) <= target) idx = i;
        else break;
    }
    return idx;
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

/** 확정 기준선 색 — 일반 선(D/M)·알람(A)과 갈라 보이게. 계산 축이 실제로 읽는 그 선임을 색으로 알린다. */
export const ANCHOR_LINE_COLOR = "#0ea5e9";

/**
 * 차트 앵커(baseline) → 렌더선. **저장된 시장(market)·값(field)을 raw 번들에서 읽는다** —
 * 모드 뷰(dailyView)로 읽으면 차트 토글에 따라 값이 바뀌어 "사람이 지목한 그 값"이 아니게 된다
 * (KRX/UN 고가가 다르거나 NXT 오염 캔들을 피해 지목한 판단이 market 저장의 존재 이유).
 * 앵커 캔들이 로드 창 밖이면 그 선은 생략(없는 좌표를 0 이나 추정값으로 그리지 않는다).
 *
 * **확정 기준선 표시**: 해소된 선 중 가격 최저(타이=좌표 최신)를 하늘색+라벨로 갈라 보인다 —
 * 서버 리졸버(core baselineResolver)와 같은 규칙이라, 화면의 하늘색 선 = 계산 축이 쓰는 그 선이다.
 *
 * ⚠ **비교는 수정주가 스케일에서** 한다: D 는 수정주가(일봉 번들), M 은 원주가(분봉)라 감자·액분이 낀 종목에선
 * 두 값이 배율만큼 다른 자에 있다 — 그대로 겨루면 "최저"가 뒤집힌다. M 을 그 날 환산비(rawScale)로 되돌려
 * 겨루되, **그리는 값(price)은 그대로** 둔다: 분봉 pane 은 M/A 를 원주가 기준가로, D 를 수정주가 전일종가로
 * 나눠 %를 내므로(linePct) 각 선은 자기 스케일 그대로여야 제자리에 선다.
 */
export function resolveChartAnchorLines(
    anchors: readonly ChartAnchor[],
    dailyBundle: ChartBundle | undefined,
    minuteBundle: ChartBundle | undefined,
): RenderLine[] {
    const out: RenderLine[] = [];
    let bestIdx = -1;
    let best: { price: number; coord: string } | null = null;
    const rawScale = minuteBundle?.rawScale ?? 1; // 없으면(옛 서버) 1 — 계수가 없던 시절의 동작
    for (const a of anchors) {
        if (a.param !== BASELINE_PARAM || !a.field || !a.market) continue;
        let raw: string | undefined;
        let kind: "D" | "M";
        if (a.anchorTime) {
            const m = minuteBundle?.minutes.find((c) => c.date === a.anchorDate && c.time === a.anchorTime);
            raw = (a.market === "krx" ? m?.krx : m?.un)?.[a.field];
            kind = "M";
        } else {
            const d = dailyBundle?.daily.find((c) => c.date === a.anchorDate);
            raw = (a.market === "krx" ? d?.krx : d?.un)?.[a.field];
            kind = "D";
        }
        const price = candlePrice(raw);
        if (price === null) continue;
        // 겨루기용 가격만 한 스케일(수정주가)로 — 원주가인 M 만 되돌린다.
        const cand = { price: kind === "M" && rawScale > 0 ? price / rawScale : price, coord: anchorCoordKey(a) };
        out.push({ id: chartAnchorKey(a), price, kind });
        // 확정 표시는 서버 리졸버와 **같은 도메인 함수**(beatsAsBaseline)로 고른다 — 비교식을 여기 다시 적으면
        // 규칙이 한쪽만 바뀌었을 때 하늘색 선 ≠ 축이 재는 선이 되고, 그 선이 육안 검증의 근거라 치명적이다.
        if (!best || beatsAsBaseline(cand, best)) {
            bestIdx = out.length - 1;
            best = cand;
        }
    }
    if (bestIdx >= 0) {
        out[bestIdx] = { ...out[bestIdx], color: ANCHOR_LINE_COLOR, label: "기준선" };
    }
    return out;
}
