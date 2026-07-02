// 분봉 차트 세로선(시점 커서) — lightweight-charts v5 는 네이티브 세로선이 없어 series primitive 로 구현.
// 지정 시각(unix초)에 캔들 pane 전체 높이를 가로지르는 파선 1개. Focus.time 스크러버가 이 선을 움직인다.
import type { IChartApi, ISeriesPrimitive, Time, UTCTimestamp } from "lightweight-charts";

// fancy-canvas 타입이 lightweight-charts 에서 재노출되지 않아 최소 구조만 로컬 선언(우리가 쓰는 필드만).
interface BitmapScope {
    context: CanvasRenderingContext2D;
    bitmapSize: { width: number; height: number };
    horizontalPixelRatio: number;
}
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: BitmapScope) => void): void;
}

class VertLinePaneRenderer {
    constructor(
        private readonly _x: number | null,
        private readonly _color: string,
    ) {}
    draw(target: DrawTarget): void {
        const x = this._x;
        if (x === null) return;
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const px = Math.round(x * scope.horizontalPixelRatio) + 0.5;
            const dash = 4 * scope.horizontalPixelRatio;
            ctx.save();
            ctx.strokeStyle = this._color;
            ctx.lineWidth = Math.max(1, Math.floor(scope.horizontalPixelRatio));
            ctx.setLineDash([dash, dash]);
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, scope.bitmapSize.height);
            ctx.stroke();
            ctx.restore();
        });
    }
}

class VertLinePaneView {
    private _x: number | null = null;
    constructor(private readonly _source: VertLine) {}
    update(): void {
        const chart = this._source.chart;
        const time = this._source.time;
        if (!chart || time === null) {
            this._x = null;
            return;
        }
        const c = chart.timeScale().timeToCoordinate(time);
        this._x = c === null ? null : (c as number);
    }
    renderer(): VertLinePaneRenderer {
        return new VertLinePaneRenderer(this._x, this._source.color);
    }
    zOrder(): "top" {
        return "top";
    }
}

export class VertLine {
    chart: IChartApi | null = null;
    time: UTCTimestamp | null;
    color: string;
    private readonly _paneViews: VertLinePaneView[];
    private _requestUpdate?: () => void;

    constructor(time: UTCTimestamp | null, color: string) {
        this.time = time;
        this.color = color;
        this._paneViews = [new VertLinePaneView(this)];
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
    }
    paneViews(): VertLinePaneView[] {
        return this._paneViews;
    }
    setTime(time: UTCTimestamp | null): void {
        this.time = time;
        this._requestUpdate?.();
    }
}

/** attachPrimitive/detachPrimitive 에 넘기기 위한 캐스트(fancy-canvas 타입 미노출 우회). */
export function asPrimitive(v: VertLine): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}
