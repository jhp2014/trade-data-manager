// 분봉 차트의 **사슬 층** — 돌파 사슬(Daily 타점 생성기)을 기본 차트의 **배경**으로 얹는다(2026-09-24 재편).
//   · 사슬 띠 — 옅게(기준선 합류 뒤는 보라)
//   · 후보 봉 세로 줄 — 사슬 필터 통과·다른 조건 탈락 = 살짝 진하게 / ◇ 로 남음 = 조금 더 진하게
//   · 밴드(선택) — 러닝 고가 밴드·기준선 밴드를 **테두리 없는 옅은 면**으로(봉마다 그 봉 폭 — 비스듬히 안 잇는다)
// ▼ 표식은 없다 — 남은 타점은 상단 ◇ 가 말하고, 사슬 필터 통과 자리는 세로 줄이 조용히 받는다.
// 격자판(「Daily 타점 조건 [격자]」)과 **같은 계산**(breakoutOfStock + chainVerdicts)의 결과를 그리기만 한다.
//
// 프리미티브인 이유·draw() 에서 좌표를 푸는 이유는 dropLine.ts·legMark.ts 와 같다. 전부 zOrder "bottom"(캔들 뒤).
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

/** 진하기(겹친 뒤의 **최종** 불투명도) — 사슬 < 통과 < ◇. 통과는 "연하지만 구분되는 정도". */
export const CHAIN_ALPHA = { chain: 0.07, pass: 0.11, kept: 0.2, band: 0.13 } as const;
/** 사슬 띠 위에 얹을 때의 알파 — 겹친 결과가 목표 진하기가 되게(a = (T − b) / (1 − b)). */
const over = (target: number): number => (target - CHAIN_ALPHA.chain) / (1 - CHAIN_ALPHA.chain);

/** 한 봉 이상의 세로 띠 — 양끝 봉 포함. */
export interface ChainStripSpec {
    from: Time;
    to: Time;
    color: string;
    alpha: number;
}
/** 밴드 면 한 줄 — 봉마다 lo~hi(차트 % 축). null = 끊김(밴드 없음·소멸). */
export interface ChainFillSpec {
    color: string;
    pts: { time: Time; lo: number | null; hi: number | null }[];
}
export interface ChainLayerSpec {
    strips: ChainStripSpec[];
    fills: ChainFillSpec[];
}
export const EMPTY_CHAIN_LAYER: ChainLayerSpec = { strips: [], fills: [] };

class ChainRenderer {
    constructor(private readonly _src: ChainLayer) {}
    draw(target: DrawTarget): void {
        const { chart, series, spec } = this._src;
        if (!chart || !series || (spec.strips.length === 0 && spec.fills.length === 0)) return;
        const ts = chart.timeScale();
        target.useBitmapCoordinateSpace((scope) => {
            const hr = scope.horizontalPixelRatio;
            const vr = scope.verticalPixelRatio;
            const half = (ts.options().barSpacing / 2) * hr;
            const ctx = scope.context;
            ctx.save();
            for (const s of spec.strips) {
                const x1 = ts.timeToCoordinate(s.from);
                const x2 = ts.timeToCoordinate(s.to);
                if (x1 === null || x2 === null) continue; // 창 계산 밖이면 지어내지 않는다
                ctx.globalAlpha = s.alpha;
                ctx.fillStyle = s.color;
                const left = (x1 as number) * hr - half;
                ctx.fillRect(left, 0, (x2 as number) * hr + half - left, scope.bitmapSize.height);
            }
            ctx.globalAlpha = CHAIN_ALPHA.band;
            for (const f of spec.fills) {
                ctx.fillStyle = f.color;
                for (const p of f.pts) {
                    if (p.lo === null || p.hi === null) continue;
                    const x = ts.timeToCoordinate(p.time);
                    const yHi = series.priceToCoordinate(p.hi);
                    const yLo = series.priceToCoordinate(p.lo);
                    if (x === null || yHi === null || yLo === null) continue;
                    const top = (yHi as number) * vr;
                    ctx.fillRect((x as number) * hr - half, top, half * 2, Math.max(1, (yLo as number) * vr - top));
                }
            }
            ctx.restore();
        });
    }
}

class ChainPaneView {
    constructor(private readonly _renderer: ChainRenderer) {}
    update(): void {} // 해소는 draw 로 미뤘다(dropLine 과 같은 계약)
    renderer(): ChainRenderer {
        return this._renderer;
    }
    zOrder(): "bottom" {
        return "bottom";
    }
}

export class ChainLayer {
    chart: IChartApi | null = null;
    series: ISeriesApi<"Candlestick"> | null = null;
    spec: ChainLayerSpec = EMPTY_CHAIN_LAYER;
    private readonly _paneViews: ChainPaneView[];
    private _requestUpdate?: () => void;

    constructor() {
        this._paneViews = [new ChainPaneView(new ChainRenderer(this))];
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

/** 사슬 층 입력 — 시각은 전부 unix초(`/day-replay` 봉 시각), 밴드 값은 **이미 차트 % 축으로 옮긴 값**. */
export interface ChainOverlayInput {
    /** 사슬 — 첫 봉~사슬 안 마지막 봉. baselineFrom = 기준선 합류 봉(없으면 null). */
    chains: { from: number; to: number; baselineFrom: number | null }[];
    /** 사슬 필터 후보 봉 — kept = ◇ 로 남았나(모르면 false — 결과가 오며 거꾸로 옅어지지 않게). */
    candidates: { time: number; label: BreakoutLabel; kept: boolean }[];
    /** 밴드 면(켰을 때만). */
    fills: ChainFillSpec[];
}

const colorOf = (l: BreakoutLabel): string => (l === "baseline" ? BREAKOUT_BASE : BREAKOUT_HIGH);

/** 입력 → 스펙. 차트 봉에 없는 시각은 버린다(지어내지 않는다). 사슬 띠는 기준선 합류 봉에서 두 토막으로 갈린다. */
export function buildChainLayerSpec(points: readonly MinutePoint[], input: ChainOverlayInput): ChainLayerSpec {
    const byTime = new Set(points.map((p) => p.time));
    const idxOf = new Map(points.map((p, i) => [p.time, i]));
    const strips: ChainStripSpec[] = [];
    const strip = (from: number, to: number, color: string, alpha: number): void => {
        strips.push({ from: from as Time, to: to as Time, color, alpha });
    };
    for (const c of input.chains) {
        if (!byTime.has(c.from) || !byTime.has(c.to)) continue;
        const split = c.baselineFrom !== null && byTime.has(c.baselineFrom) ? c.baselineFrom : null;
        if (split === null) {
            strip(c.from, c.to, BREAKOUT_HIGH, CHAIN_ALPHA.chain);
            continue;
        }
        if (split > c.from) {
            // 합류 직전 봉까지 고가 띠 — 차트 봉 순서로 한 칸 앞.
            const prev = points[(idxOf.get(split) ?? 0) - 1];
            if (prev && prev.time >= c.from) strip(c.from, prev.time, BREAKOUT_HIGH, CHAIN_ALPHA.chain);
        }
        strip(split, c.to, BREAKOUT_BASE, CHAIN_ALPHA.chain);
    }
    for (const k of input.candidates) {
        if (!byTime.has(k.time)) continue;
        strip(k.time, k.time, colorOf(k.label), over(k.kept ? CHAIN_ALPHA.kept : CHAIN_ALPHA.pass));
    }
    // 밴드 점도 차트 봉만 — 차트엔 채움봉(거래 없는 분)이 없다.
    const fills = input.fills.map((f) => ({ ...f, pts: f.pts.filter((p) => byTime.has(p.time as number)) }));
    return { strips, fills };
}
