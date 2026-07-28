// 순위 분석 히트맵 — lightweight-charts series primitive. 밀도 셀(시간×%) + 진입/horizon/목표/손절 선을
// 차트 좌표계 위에 직접 렌더한다(시간축 네이티브 줌/팬·%축 스케일에 자동 동기). VertLines 와 같은 구조.
//  · update() 에서 timeScale.timeToCoordinate·series.priceToCoordinate 로 media px 해소 → renderer 는 픽셀만 그림.
//  · 셀 y 는 행 경계 pct 를 행마다 1회만 좌표변환(열마다 재변환 안 함)해 비용을 줄인다.
import type { IChartApi, ISeriesApi, ISeriesPrimitive, Time } from "lightweight-charts";
import { FAIL, STRONG } from "../../styles/palette.js";

interface BitmapScope {
    context: CanvasRenderingContext2D;
    bitmapSize: { width: number; height: number };
    horizontalPixelRatio: number;
    verticalPixelRatio: number;
}
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: BitmapScope) => void): void;
}

/** 히트맵 모델 — 열별 밀도 격자 + 기준선들. 컴포넌트가 setModel 로 주입. */
export interface HeatModel {
    colTimes: Time[]; // 열(버킷) 시각(unix초)
    grid: number[][]; // [col][row] 밀도(겹친 상황 수)
    max: number; // 밀도 최댓값(정규화)
    rows: number;
    yLo: number;
    yHi: number;
    entryTime: Time; // 진입(t0)
    horizonTime: Time; // horizon 우단
    target: number; // 목표 %
    stop: number; // 손절 %
}

const BLUE = "#2a78d6";
const GREEN = STRONG;
const RED = FAIL;

interface ResolvedCell { x: number; y: number; w: number; h: number; a: number }
interface Resolved {
    cells: ResolvedCell[];
    zeroY: number | null;
    entryX: number | null;
    horizonX: number | null;
    targetY: number | null;
    stopY: number | null;
}

class HeatRenderer {
    constructor(private readonly _r: Resolved) {}
    draw(target: DrawTarget): void {
        const r = this._r;
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const hp = scope.horizontalPixelRatio;
            const vp = scope.verticalPixelRatio;
            const W = scope.bitmapSize.width;
            const H = scope.bitmapSize.height;
            ctx.save();

            // 밀도 셀
            for (const c of r.cells) {
                ctx.fillStyle = BLUE;
                ctx.globalAlpha = c.a;
                ctx.fillRect(c.x * hp, c.y * vp, Math.max(1, c.w * hp + 1), Math.max(1, c.h * vp + 1));
            }
            ctx.globalAlpha = 1;

            const vline = (x: number, color: string, width: number, dash: boolean): void => {
                const px = Math.round(x * hp) + 0.5;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, Math.floor(width * hp));
                ctx.setLineDash(dash ? [4 * hp, 4 * hp] : []);
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, H);
                ctx.stroke();
            };
            const hline = (y: number, color: string, width: number, dash: boolean): void => {
                const py = Math.round(y * vp) + 0.5;
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, Math.floor(width * vp));
                ctx.setLineDash(dash ? [6 * hp, 4 * hp] : []);
                ctx.beginPath();
                ctx.moveTo(0, py);
                ctx.lineTo(W, py);
                ctx.stroke();
            };

            if (r.zeroY != null) hline(r.zeroY, "rgba(130,130,130,0.7)", 1, false);
            if (r.horizonX != null) {
                // horizon 오른쪽 dim
                ctx.setLineDash([]);
                ctx.fillStyle = "rgba(128,128,128,0.20)";
                const hx = r.horizonX * hp;
                if (W - hx > 0) ctx.fillRect(hx, 0, W - hx, H);
                vline(r.horizonX, "rgba(90,90,90,0.85)", 1.5, true);
            }
            if (r.entryX != null) vline(r.entryX, "rgba(120,120,120,0.85)", 1, true);
            if (r.targetY != null) hline(r.targetY, GREEN, 1.5, true);
            if (r.stopY != null) hline(r.stopY, RED, 1.5, true);
            ctx.setLineDash([]);
            ctx.restore();
        });
    }
}

class HeatPaneView {
    private _resolved: Resolved = { cells: [], zeroY: null, entryX: null, horizonX: null, targetY: null, stopY: null };
    constructor(private readonly _src: RankHeatmap) {}
    update(): void {
        const chart = this._src.chart;
        const series = this._src.series;
        const m = this._src.model;
        if (!chart || !series || !m) {
            this._resolved = { cells: [], zeroY: null, entryX: null, horizonX: null, targetY: null, stopY: null };
            return;
        }
        const ts = chart.timeScale();
        const colX = m.colTimes.map((t) => ts.timeToCoordinate(t) as number | null);
        const step = (m.yHi - m.yLo) / m.rows;
        const rowY: (number | null)[] = [];
        for (let r = 0; r <= m.rows; r++) rowY.push(series.priceToCoordinate(m.yLo + r * step) as number | null);

        const cells: ResolvedCell[] = [];
        for (let c = 0; this._src.showCells && c < m.colTimes.length; c++) {
            const x = colX[c];
            if (x == null) continue;
            const xNext = colX[c + 1] ?? (colX[c - 1] != null ? x + (x - (colX[c - 1] as number)) : x + 3);
            const w = Math.max(1, (xNext as number) - x);
            const col = m.grid[c];
            for (let r = 0; r < m.rows; r++) {
                const d = col[r];
                if (!d) continue;
                const yTop = rowY[r + 1];
                const yBot = rowY[r];
                if (yTop == null || yBot == null) continue;
                // 알파 바닥값 0.05 — 존재하면 옅게라도 보이되, 표본 적을 때 1개짜리가 진하지 않게 전체를 낮춤.
                cells.push({ x, y: yTop, w, h: yBot - yTop, a: 0.05 + Math.pow(d / m.max, 0.7) * 0.45 });
            }
        }
        const targetY = series.priceToCoordinate(m.target) as number | null;
        const stopY = series.priceToCoordinate(m.stop) as number | null;
        const horizonX = ts.timeToCoordinate(m.horizonTime) as number | null;
        this._resolved = {
            cells,
            zeroY: series.priceToCoordinate(0) as number | null,
            entryX: ts.timeToCoordinate(m.entryTime) as number | null,
            horizonX,
            targetY,
            stopY,
        };
        // 축 여백 드래그 핸들 위치를 매 프레임(줌/팬/스케일) 동기 — HTML 핸들을 명령형으로 재배치.
        this._src.onLayout?.({ targetY, stopY, horizonX });
    }
    renderer(): HeatRenderer {
        return new HeatRenderer(this._resolved);
    }
    zOrder(): "bottom" {
        return "bottom"; // 밀도는 축·크로스헤어 아래
    }
}

export class RankHeatmap {
    chart: IChartApi | null = null;
    series: ISeriesApi<"Line"> | null = null;
    model: HeatModel | null = null;
    showCells = true; // 밀도 셀 표시 여부 — off 시 기준선·오버레이만(차트만 보기)
    onLayout?: (c: { targetY: number | null; stopY: number | null; horizonX: number | null }) => void;
    private readonly _views: HeatPaneView[];
    private _requestUpdate?: () => void;

    constructor() {
        this._views = [new HeatPaneView(this)];
    }
    setSeries(s: ISeriesApi<"Line">): void {
        this.series = s;
    }
    setModel(m: HeatModel): void {
        this.model = m;
        this._requestUpdate?.();
    }
    setCellsVisible(v: boolean): void {
        this.showCells = v;
        this._requestUpdate?.();
    }
    attached(param: { chart: IChartApi; requestUpdate: () => void }): void {
        this.chart = param.chart;
        this._requestUpdate = param.requestUpdate;
    }
    detached(): void {
        this.chart = null;
        this._requestUpdate = undefined;
    }
    updateAllViews(): void {
        for (const v of this._views) v.update();
    }
    paneViews(): HeatPaneView[] {
        return this._views;
    }
}

/** attachPrimitive 캐스트(fancy-canvas 타입 미노출 우회). */
export function asHeatPrimitive(v: RankHeatmap): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}
