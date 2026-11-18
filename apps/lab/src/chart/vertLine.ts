// 분봉 차트 세로선 — lightweight-charts v5 는 네이티브 세로선이 없어 series primitive 로 구현.
// 지정 시각(unix초)들에 pane 전체 높이를 가로지르는 선을 그린다(지금은 경로 시각선 하나).
// 캔들 pane 과 거래대금 pane 두 series 에 각각 부착하면(같은 timeScale x 공유) 세로선이 아래까지 이어진다.
// label 을 주면 시간축에 그 글자를 선 색 바탕으로 붙인다(크로스헤어 시간 라벨과 같은 자리·모양) — 시간축은 하나라 한 series 에만 줄 것.
import type { IChartApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, Time, UTCTimestamp } from "lightweight-charts";

// fancy-canvas 타입이 lightweight-charts 에서 재노출되지 않아 최소 구조만 로컬 선언(우리가 쓰는 필드만).
interface BitmapScope {
    context: CanvasRenderingContext2D;
    bitmapSize: { width: number; height: number };
    horizontalPixelRatio: number;
}
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: BitmapScope) => void): void;
}

/** 그릴 세로선 1개 — 시각(unix초) + 색·굵기·파선 여부. */
export interface VertLineSpec {
    time: UTCTimestamp;
    color: string;
    width?: number; // px (기본 1)
    dashed?: boolean; // 기본 실선
    /** 시간축 라벨(예: "10:32") — 없으면 라벨 없음. */
    label?: string;
}

/** 화면 좌표로 해소된 선(x=null 이면 범위 밖 → 생략). */
interface ResolvedLine {
    x: number;
    color: string;
    width: number;
    dashed: boolean;
}

class VertLinesPaneRenderer {
    constructor(private readonly _lines: ResolvedLine[]) {}
    draw(target: DrawTarget): void {
        if (this._lines.length === 0) return;
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const ratio = scope.horizontalPixelRatio;
            ctx.save();
            for (const l of this._lines) {
                const px = Math.round(l.x * ratio) + 0.5;
                ctx.strokeStyle = l.color;
                ctx.lineWidth = Math.max(1, Math.floor((l.width ?? 1) * ratio));
                if (l.dashed) {
                    const dash = 4 * ratio;
                    ctx.setLineDash([dash, dash]);
                } else {
                    ctx.setLineDash([]);
                }
                ctx.beginPath();
                ctx.moveTo(px, 0);
                ctx.lineTo(px, scope.bitmapSize.height);
                ctx.stroke();
            }
            ctx.restore();
        });
    }
}

class VertLinesPaneView {
    private _resolved: ResolvedLine[] = [];
    constructor(private readonly _source: VertLines) {}
    update(): void {
        const chart = this._source.chart;
        if (!chart) {
            this._resolved = [];
            return;
        }
        const ts = chart.timeScale();
        const out: ResolvedLine[] = [];
        for (const l of this._source.lines) {
            const c = ts.timeToCoordinate(l.time);
            if (c !== null) out.push({ x: c as number, color: l.color, width: l.width ?? 1, dashed: l.dashed ?? false });
        }
        this._resolved = out;
    }
    renderer(): VertLinesPaneRenderer {
        return new VertLinesPaneRenderer(this._resolved);
    }
    zOrder(): "top" {
        return "top";
    }
}

/** 시간축 라벨 하나 — 선 색 바탕 + 흰 글씨. 좌표는 updateAllViews 때 해소해 둔다. */
class VertLineTimeAxisView implements ISeriesPrimitiveAxisView {
    constructor(
        private readonly _x: number,
        private readonly _label: string,
        private readonly _color: string,
    ) {}
    coordinate(): number {
        return this._x;
    }
    text(): string {
        return this._label;
    }
    textColor(): string {
        return "#ffffff";
    }
    backColor(): string {
        return this._color;
    }
    visible(): boolean {
        return true;
    }
    tickVisible(): boolean {
        return true;
    }
}

export class VertLines {
    chart: IChartApi | null = null;
    lines: VertLineSpec[] = [];
    private readonly _paneViews: VertLinesPaneView[];
    private _axisViews: VertLineTimeAxisView[] = [];
    private _requestUpdate?: () => void;

    constructor(lines: VertLineSpec[] = []) {
        this.lines = lines;
        this._paneViews = [new VertLinesPaneView(this)];
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
        for (const v of this._paneViews) v.update();
        const ts = this.chart?.timeScale();
        const out: VertLineTimeAxisView[] = [];
        if (ts)
            for (const l of this.lines) {
                if (l.label === undefined) continue;
                const c = ts.timeToCoordinate(l.time);
                if (c !== null) out.push(new VertLineTimeAxisView(c as number, l.label, l.color));
            }
        this._axisViews = out;
    }
    timeAxisViews(): VertLineTimeAxisView[] {
        return this._axisViews;
    }
    paneViews(): VertLinesPaneView[] {
        return this._paneViews;
    }
    setLines(lines: VertLineSpec[]): void {
        this.lines = lines;
        this._requestUpdate?.();
    }
}

/** attachPrimitive/detachPrimitive 에 넘기기 위한 캐스트(fancy-canvas 타입 미노출 우회). */
export function asPrimitive(v: VertLines): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}
