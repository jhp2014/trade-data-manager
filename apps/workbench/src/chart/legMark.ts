// 고점 렌즈의 다리 표식 — **드롭 캡**(고점 봉 고가 위 짧은 선 + 점, 상시) + **다리 띠**(선택한 시그널의
// 크로싱~고점 구간 배경, 하나만). 2026-09-02 확정: 옛 "고점 전신 세로선"은 시그널 세로선과 형태가 같아
// 구분이 안 됐다 — 캡은 "이 봉을 지목", 띠는 "이 구간이 다리"로 형태 자체를 가른다.
//
// 프리미티브인 이유·draw() 에서 좌표를 푸는 이유는 dropLine.ts 와 동일(가격축까지 따라야 하고,
// 가격축만 바뀌는 조작에 updateAllViews 보장이 없다). 한 프리미티브가 pane view 둘을 낸다:
// 띠는 zOrder "bottom"(캔들 뒤), 캡은 "top"(캔들 앞) — 층이 달라야 띠가 봉을 안 가린다.
import type { IChartApi, ISeriesApi, ISeriesPrimitive, Time } from "lightweight-charts";
import { snapToBar } from "../lib/chartFrame.js";
import { HIGH_GAP } from "../lib/anchorMarks.js";
import { MARKER_RESERVE } from "./anchorMarkOverlay.js";
import { LEG_HIGH } from "../styles/palette.js";
import type { MinutePoint } from "../lib/derive.js";

// fancy-canvas 타입이 lightweight-charts 에서 재노출되지 않아 최소 구조만 로컬 선언(vertLine 과 같은 우회).
interface BitmapScope {
    context: CanvasRenderingContext2D;
    bitmapSize: { width: number; height: number };
    horizontalPixelRatio: number;
    verticalPixelRatio: number;
}
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: BitmapScope) => void): void;
}

/** 드롭 캡 하나 — 고점 봉(time)과 그 봉의 고가(value, 분봉 % 축), 고가에서 띄울 간격(gap, px). */
export interface LegCapSpec {
    time: Time;
    value: number;
    /** 고가 위 예약 공간 계약(anchorMarkOverlay 와 동일) — HIGH_GAP + (그 봉에 거래대금 마커가 있으면) 예약분.
     *  고정값이면 캡이 봉 위 마커를 관통한다(드롭선이 gap 을 두는 그 이유 그대로). */
    gap: number;
}

/** 다리 띠 — 시작 봉(크로싱이 아니라 **시그널 봉**: 사용자가 고른 행의 자리)부터 고점 봉까지. */
export interface LegBandSpec {
    from: Time;
    to: Time;
}

const CAP_LEN = 12; // 점 위로 뻗는 선 길이(px)
const CAP_DOT = 2.2; // 점 반지름(px)
const BAND_FILL = "rgba(190,122,0,0.09)"; // LEG_HIGH 의 옅은 판 — 여러 봉을 덮어도 시끄럽지 않게

class LegCapsRenderer {
    constructor(private readonly _source: LegMarks) {}
    draw(target: DrawTarget): void {
        const { chart, series } = this._source;
        const caps = this._source.caps;
        if (!chart || !series || caps.length === 0) return;
        const ts = chart.timeScale();
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const hr = scope.horizontalPixelRatio;
            const vr = scope.verticalPixelRatio;
            ctx.save();
            ctx.strokeStyle = LEG_HIGH;
            ctx.fillStyle = LEG_HIGH;
            ctx.lineWidth = Math.max(1, Math.round(1.2 * hr));
            for (const c of caps) {
                // 좌표는 매 페인트에 푼다 — 가격축만 바뀌는 조작에도 캡이 봉을 따라오도록(dropLine 규칙).
                const x = ts.timeToCoordinate(c.time);
                const y = series.priceToCoordinate(c.value);
                if (x === null || y === null) continue; // 봉이 시리즈에 없거나 축 밖 — 지어내지 않는다
                const px = Math.round((x as number) * hr) + 0.5;
                const dotY = ((y as number) - c.gap - CAP_DOT) * vr;
                ctx.beginPath();
                ctx.arc(px, dotY, CAP_DOT * Math.max(hr, vr) * 0.9, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(px, dotY - CAP_DOT * vr);
                ctx.lineTo(px, dotY - (CAP_DOT + CAP_LEN) * vr);
                ctx.stroke();
            }
            ctx.restore();
        });
    }
}

class LegBandRenderer {
    constructor(private readonly _source: LegMarks) {}
    draw(target: DrawTarget): void {
        const { chart, band } = this._source;
        if (!chart || band === null) return;
        const ts = chart.timeScale();
        target.useBitmapCoordinateSpace((scope) => {
            const x1 = ts.timeToCoordinate(band.from);
            const x2 = ts.timeToCoordinate(band.to);
            if (x1 === null || x2 === null) return; // 한쪽이 창 계산 밖이면 띠를 지어내지 않는다
            const hr = scope.horizontalPixelRatio;
            // 봉 중심~중심이 아니라 봉 폭 절반씩 넓혀, 한 봉짜리 다리(시그널 봉 = 고점 봉)도 띠가 보인다.
            const half = (ts.options().barSpacing / 2) * hr;
            const left = Math.min(x1 as number, x2 as number) * hr - half;
            const right = Math.max(x1 as number, x2 as number) * hr + half;
            const ctx = scope.context;
            ctx.save();
            ctx.fillStyle = BAND_FILL;
            ctx.fillRect(left, 0, right - left, scope.bitmapSize.height);
            ctx.restore();
        });
    }
}

class LegPaneView {
    constructor(
        private readonly _renderer: LegCapsRenderer | LegBandRenderer,
        private readonly _z: "bottom" | "top",
    ) {}
    update(): void {} // 해소는 draw 로 미뤘다(dropLine 과 같은 계약)
    renderer(): LegCapsRenderer | LegBandRenderer {
        return this._renderer;
    }
    zOrder(): "bottom" | "top" {
        return this._z;
    }
}

export class LegMarks {
    chart: IChartApi | null = null;
    series: ISeriesApi<"Candlestick"> | null = null;
    caps: LegCapSpec[] = [];
    band: LegBandSpec | null = null;
    private readonly _paneViews: LegPaneView[];
    private _requestUpdate?: () => void;

    constructor() {
        this._paneViews = [new LegPaneView(new LegBandRenderer(this), "bottom"), new LegPaneView(new LegCapsRenderer(this), "top")];
    }
    attached(param: { chart: IChartApi; series: ISeriesApi<"Candlestick">; requestUpdate: () => void }): void {
        this.chart = param.chart;
        this.series = param.series;
        this._requestUpdate = param.requestUpdate;
    }
    detached(): void {
        this.chart = null;
        this.series = null;
        this._requestUpdate = undefined;
    }
    updateAllViews(): void {
        for (const v of this._paneViews) v.update();
    }
    paneViews(): LegPaneView[] {
        return this._paneViews;
    }
    set(caps: LegCapSpec[], band: LegBandSpec | null): void {
        this.caps = caps;
        this.band = band;
        this._requestUpdate?.();
    }
}

/** attachPrimitive/detachPrimitive 캐스트(fancy-canvas 타입 미노출 우회 — vertLine 과 같은 이유). */
export function asLegPrimitive(v: LegMarks): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}

/**
 * 스펙 조립(순수) — 시각(unix초)들을 실제 봉으로 스냅하고 그 봉의 고가(%)를 캡 값으로 든다.
 * 봉이 없는 시각(스냅 실패)·중복 봉은 버린다. 띠는 양끝 다 스냅돼야 선다(한쪽만 지어내지 않는다).
 * `hasMarker` = 그 봉에 봉 위 마커(거래대금)가 있나 — 있으면 캡을 예약분만큼 더 띄운다(드롭선과 같은 계약).
 * 같은 봉에 앵커 드롭선이 함께 서면 캡 점이 드롭선 끝을 막는 모양이 되는데, 둘 다 "이 봉"을 가리키는
 * 표식이라 수용(색·실/파선으로 갈린다 — 2026-09-02 리뷰 판정).
 */
export function buildLegSpecs(
    points: readonly MinutePoint[],
    highTimes: readonly number[],
    band: { from: number; to: number } | null,
    hasMarker: (p: MinutePoint) => boolean = () => false,
): { caps: LegCapSpec[]; band: LegBandSpec | null } {
    const byTime = new Map(points.map((p) => [p.time, p]));
    const caps: LegCapSpec[] = [];
    const seen = new Set<number>();
    for (const t of highTimes) {
        const s = snapToBar(points, t);
        if (s === null || seen.has(s)) continue;
        const bar = byTime.get(s);
        if (!bar) continue;
        seen.add(s);
        caps.push({ time: s as Time, value: bar.high, gap: HIGH_GAP + (hasMarker(bar) ? MARKER_RESERVE : 0) });
    }
    let bandSpec: LegBandSpec | null = null;
    if (band !== null) {
        const from = snapToBar(points, band.from);
        const to = snapToBar(points, band.to);
        if (from !== null && to !== null) bandSpec = { from: from as Time, to: to as Time };
    }
    return { caps, band: bandSpec };
}
