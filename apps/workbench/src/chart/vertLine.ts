// 분봉 차트 세로선 — lightweight-charts v5 는 네이티브 세로선이 없어 series primitive 로 구현.
// 지정 시각(unix초)들에 pane 전체 높이를 가로지르는 파선을 그린다. 하나의 primitive 가 여러 선을 담는다:
//   · 현재 타점(Focus.time) = 진한 실/파선 1개
//   · 저장된 복기 타점들 = 흐린 파선 N개
// 캔들 pane 과 거래대금 pane 두 series 에 각각 부착하면(같은 timeScale x 공유) 세로선이 아래까지 이어진다.
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

/** 그릴 세로선 1개 — 시각(unix초) + 색·굵기·파선 여부 + 선택 라벨(상단 텍스트). */
export interface VertLineSpec {
    time: UTCTimestamp;
    color: string;
    width?: number; // px (기본 1)
    dashed?: boolean; // 기본 실선
    label?: string; // 선 상단에 표시(날짜 등). 없으면 텍스트 없음.
}

/** 화면 좌표로 해소된 선(x=null 이면 범위 밖 → 생략). */
interface ResolvedLine {
    x: number;
    color: string;
    width: number;
    dashed: boolean;
    label?: string;
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
                if (l.label) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = l.color;
                    ctx.font = `${Math.round(12 * ratio)}px -apple-system, system-ui, sans-serif`;
                    ctx.textBaseline = "top";
                    const pad = 4 * ratio;
                    // 우측으로 넘치면 선 왼쪽에 표시(분봉 라벨처럼 화면 밖 방지).
                    const overflow = px + pad + ctx.measureText(l.label).width > scope.bitmapSize.width;
                    ctx.textAlign = overflow ? "right" : "left";
                    ctx.fillText(l.label, overflow ? px - pad : px + pad, pad);
                    ctx.textAlign = "left";
                }
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
            if (c !== null) out.push({ x: c as number, color: l.color, width: l.width ?? 1, dashed: l.dashed ?? false, label: l.label });
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

export class VertLines {
    chart: IChartApi | null = null;
    lines: VertLineSpec[] = [];
    private readonly _paneViews: VertLinesPaneView[];
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
