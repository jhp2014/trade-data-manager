// 분봉 차트의 **사슬 층** — 돌파 사슬(Daily 타점 생성기)을 기본 차트 위에 얹는다(2026-09-24 A안).
//   ② 사슬 띠(배경, 캔들 뒤) · ③ 후보 ▼(고가 위) · ① 밴드 계단(선택 — 러닝 고가 밴드 상단·하단, 기준선 밴드 하단)
// 격자판(「Daily 타점 조건 - 격자」)의 그림과 **같은 계산**(breakoutOfStock + chainVerdicts)의 결과를 받아
// 그리기만 한다 — 판정은 여기 없다. 레인·떨어진 조건 설명은 격자판에만 산다(여긴 보는 곳, 거긴 고치는 곳).
//
// 프리미티브인 이유·draw() 에서 좌표를 푸는 이유는 dropLine.ts·legMark.ts 와 같다(가격축까지 따라야 하고,
// 가격축만 바뀌는 조작에 updateAllViews 보장이 없다). 띠는 zOrder "bottom"(캔들 뒤), ▼·계단은 "top".
//
// ▼ 를 마커 플러그인에 넣지 않는 이유: 마커 칸(aboveBar)은 통째 교체이고 거래대금 ● 가 이미 쓴다 — ▼ 가
// 그 줄에 끼면 서로 밀린다. 여기서 그리면 기존 마커를 안 건드리고, 고가 위 예약 공간 계약(HIGH_GAP +
// 마커 예약분 — anchorMarkOverlay·legMark 와 같은 것)으로 ● 를 비켜 선다.
import type { IChartApi, ISeriesApi, ISeriesPrimitive, Time } from "lightweight-charts";
import type { BreakoutLabel } from "@trade-data-manager/market/domain";
import { BREAKOUT_BASE, BREAKOUT_HIGH } from "../styles/palette.js";
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

/** 사슬 띠 한 토막 — 양끝 봉 포함. */
export interface ChainBandSpec {
    from: Time;
    to: Time;
    color: string;
}
/** 후보 ▼ — 그 봉의 고가(차트 % 축)에서 gap(px) 위. */
export interface ChainMarkSpec {
    time: Time;
    value: number;
    gap: number;
    color: string;
}
/** ① 계단 한 줄 — 봉마다 그 봉 폭만큼의 가로선. null = 끊김(밴드 없음·소멸). */
export interface ChainStepSpec {
    color: string;
    dash: number[];
    pts: { time: Time; value: number | null }[];
}
export interface ChainLayerSpec {
    bands: ChainBandSpec[];
    marks: ChainMarkSpec[];
    steps: ChainStepSpec[];
}
export const EMPTY_CHAIN_LAYER: ChainLayerSpec = { bands: [], marks: [], steps: [] };

const BAND_ALPHA = 0.1;
const MARK_PX = 11;

class ChainBandRenderer {
    constructor(private readonly _src: ChainLayer) {}
    draw(target: DrawTarget): void {
        const { chart } = this._src;
        const bands = this._src.spec.bands;
        if (!chart || bands.length === 0) return;
        const ts = chart.timeScale();
        target.useBitmapCoordinateSpace((scope) => {
            const hr = scope.horizontalPixelRatio;
            const half = (ts.options().barSpacing / 2) * hr;
            const ctx = scope.context;
            ctx.save();
            ctx.globalAlpha = BAND_ALPHA;
            for (const b of bands) {
                const x1 = ts.timeToCoordinate(b.from);
                const x2 = ts.timeToCoordinate(b.to);
                if (x1 === null || x2 === null) continue; // 창 계산 밖이면 지어내지 않는다
                ctx.fillStyle = b.color;
                const left = (x1 as number) * hr - half;
                ctx.fillRect(left, 0, (x2 as number) * hr + half - left, scope.bitmapSize.height);
            }
            ctx.restore();
        });
    }
}

class ChainTopRenderer {
    constructor(private readonly _src: ChainLayer) {}
    draw(target: DrawTarget): void {
        const { chart, series, spec } = this._src;
        if (!chart || !series || (spec.marks.length === 0 && spec.steps.length === 0)) return;
        const ts = chart.timeScale();
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const hr = scope.horizontalPixelRatio;
            const vr = scope.verticalPixelRatio;
            const half = (ts.options().barSpacing / 2) * hr;
            ctx.save();
            // ① 계단 — 봉 폭만큼의 가로선을 이어 긋는다(비스듬히 잇지 않는다 — 없던 가격이 그려진다).
            ctx.lineWidth = Math.max(1, Math.round(1.2 * hr));
            for (const st of spec.steps) {
                ctx.strokeStyle = st.color;
                ctx.setLineDash(st.dash.map((d) => d * hr));
                ctx.beginPath();
                let open = false;
                for (const p of st.pts) {
                    const x = p.value === null ? null : ts.timeToCoordinate(p.time);
                    const y = p.value === null ? null : series.priceToCoordinate(p.value);
                    if (x === null || y === null) { open = false; continue; }
                    const px = (x as number) * hr;
                    const py = Math.round((y as number) * vr) + 0.5;
                    if (open) ctx.lineTo(px - half, py);
                    else ctx.moveTo(px - half, py);
                    ctx.lineTo(px + half, py);
                    open = true;
                }
                ctx.stroke();
            }
            ctx.setLineDash([]);
            // ③ ▼ — 고가 위 gap 만큼.
            ctx.font = `${Math.round(MARK_PX * vr)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            for (const m of spec.marks) {
                const x = ts.timeToCoordinate(m.time);
                const y = series.priceToCoordinate(m.value);
                if (x === null || y === null) continue;
                ctx.fillStyle = m.color;
                ctx.fillText("▼", (x as number) * hr, ((y as number) - m.gap) * vr);
            }
            ctx.restore();
        });
    }
}

class ChainPaneView {
    constructor(
        private readonly _renderer: ChainBandRenderer | ChainTopRenderer,
        private readonly _z: "bottom" | "top",
    ) {}
    update(): void {} // 해소는 draw 로 미뤘다(dropLine 과 같은 계약)
    renderer(): ChainBandRenderer | ChainTopRenderer {
        return this._renderer;
    }
    zOrder(): "bottom" | "top" {
        return this._z;
    }
}

export class ChainLayer {
    chart: IChartApi | null = null;
    series: ISeriesApi<"Candlestick"> | null = null;
    spec: ChainLayerSpec = EMPTY_CHAIN_LAYER;
    private readonly _paneViews: ChainPaneView[];
    private _requestUpdate?: () => void;

    constructor() {
        this._paneViews = [new ChainPaneView(new ChainBandRenderer(this), "bottom"), new ChainPaneView(new ChainTopRenderer(this), "top")];
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
    paneViews(): ChainPaneView[] {
        return this._paneViews;
    }
    set(spec: ChainLayerSpec): void {
        this.spec = spec;
        this._requestUpdate?.();
    }
}

/** attachPrimitive/detachPrimitive 캐스트(fancy-canvas 타입 미노출 우회 — vertLine 과 같은 이유). */
export function asChainPrimitive(v: ChainLayer): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}

// ── 스펙 조립(순수) ────────────────────────────────────────────────────────

/** 사슬 층 입력 — 시각은 전부 unix초(`/day-replay` 봉 시각), 계단 값은 **이미 차트 % 축으로 옮긴 값**. */
export interface ChainOverlayInput {
    /** 사슬 — 첫 봉~사슬 안 마지막 봉(끝 봉 = 눌림 봉은 사슬 밖). baselineFrom = 기준선 합류 봉(없으면 null). */
    chains: { from: number; to: number; baselineFrom: number | null }[];
    /** 최종 후보 봉. */
    picks: { time: number; label: BreakoutLabel }[];
    /** ① 계단(켰을 때만). */
    steps: ChainStepSpec[];
}

const colorOf = (l: BreakoutLabel): string => (l === "baseline" ? BREAKOUT_BASE : BREAKOUT_HIGH);

/**
 * 입력 → 스펙. 차트 봉에 없는 시각은 버린다(지어내지 않는다). 띠는 기준선 합류 봉에서 두 토막으로 갈린다.
 * `gapOf` = 그 봉의 고가 위 예약 공간(HIGH_GAP + 거래대금 마커 예약분 — 호출부가 차트의 마커 규칙으로 준다).
 */
export function buildChainLayerSpec(
    points: readonly MinutePoint[],
    input: ChainOverlayInput,
    gapOf: (p: MinutePoint) => number,
): ChainLayerSpec {
    const byTime = new Map(points.map((p) => [p.time, p]));
    const idxOf = new Map(points.map((p, i) => [p.time, i]));
    const bands: ChainBandSpec[] = [];
    for (const c of input.chains) {
        if (!byTime.has(c.from) || !byTime.has(c.to)) continue;
        const split = c.baselineFrom !== null && byTime.has(c.baselineFrom) ? c.baselineFrom : null;
        if (split === null) {
            bands.push({ from: c.from as Time, to: c.to as Time, color: BREAKOUT_HIGH });
            continue;
        }
        if (split > c.from) {
            // 합류 직전 봉까지 고가 띠 — 차트 봉 순서로 한 칸 앞.
            const prev = points[(idxOf.get(split) ?? 0) - 1];
            if (prev && prev.time >= c.from) bands.push({ from: c.from as Time, to: prev.time as Time, color: BREAKOUT_HIGH });
        }
        bands.push({ from: split as Time, to: c.to as Time, color: BREAKOUT_BASE });
    }
    const marks: ChainMarkSpec[] = [];
    for (const k of input.picks) {
        const p = byTime.get(k.time);
        if (!p) continue;
        marks.push({ time: p.time as Time, value: p.high, gap: gapOf(p), color: colorOf(k.label) });
    }
    // 계단 점도 차트 봉만 — 차트엔 채움봉(거래 없는 분)이 없어, 남기면 그 자리마다 선이 끊긴다.
    const steps = input.steps.map((st) => ({ ...st, pts: st.pts.filter((p) => byTime.has(p.time as number)) }));
    return { bands, marks, steps };
}
