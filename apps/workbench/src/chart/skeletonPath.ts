// 골격 꺾은선 — 손으로 찍은 피벗들을 이어 그리는 series primitive.
//
// **왜 LineSeries 가 아닌가**: LineSeries 는 시각당 점 하나만 받는다. 그런데 골격은 **한 캔들에 점이 여럿**일
// 수 있다(시→고→종 = 윗꼬리 슈팅의 표현이고, 이 시스템이 잡으려는 핵심 사례다). 시각으로 뭉개면 그 점들이
// 화면에서 사라져 "찍었는데 아무 반응이 없다"가 된다. 여기선 x(시각)·y(가격)를 각각 해소하므로 같은 캔들의
// 두 점은 **세로 선분**으로 그려진다 — 일봉 축에서 한 캔들 안의 이동은 실제로 시간이 안 흐른 수직 이동이 맞다.
//
// 점 하나만 찍어도 원이 보인다(선이 없어도 입력이 됐다는 신호가 있어야 한다).
//
// **순번을 함께 적는다.** 골격은 순서를 입력하지 않고 파생한다(시→고→종은 정리, 캔들 간은 날짜) — 그래서
// 사용자는 자기가 찍은 점들이 **어떤 순서로 읽혔는지** 화면에서 확인할 방법이 필요하다. 이 숫자가 그 확인이고,
// 서버 형태 계산이 보는 순서와 같은 규칙(도메인 sortPivots)으로 정렬된 결과다.
import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesType, Time } from "lightweight-charts";

// fancy-canvas 타입이 lightweight-charts 에서 재노출되지 않아 최소 구조만 로컬 선언(vertLine.ts 와 같은 우회).
interface BitmapScope {
    context: CanvasRenderingContext2D;
    bitmapSize: { width: number; height: number };
    horizontalPixelRatio: number;
    verticalPixelRatio: number;
}
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: BitmapScope) => void): void;
}

/** 그릴 피벗 1개 — 시각(일봉 business-day 문자열)과 가격. 정렬은 호출자가 이미 끝냈다(도메인 규칙). */
export interface SkeletonPointSpec {
    time: string;
    price: number;
}

/** 화면 좌표로 해소된 점. */
interface ResolvedPoint {
    x: number;
    y: number;
}

/** X 마커 반지름(px). 고가·무시 마커(원)와 **모양으로** 갈리는 게 요점 — 색만으로는 작은 크기에서 섞인다. */
const MARK_RADIUS = 4;

class SkeletonPathRenderer {
    constructor(
        private readonly _points: ResolvedPoint[],
        private readonly _color: string,
    ) {}

    draw(target: DrawTarget): void {
        if (this._points.length === 0) return;
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const hr = scope.horizontalPixelRatio;
            const vr = scope.verticalPixelRatio;
            const pts = this._points.map((p) => ({ x: p.x * hr, y: p.y * vr }));
            ctx.save();
            ctx.strokeStyle = this._color;
            ctx.fillStyle = this._color;

            // 선분 — 점이 둘 이상일 때만. 같은 캔들의 두 점은 x 가 같아 세로 선분이 된다.
            if (pts.length >= 2) {
                ctx.lineWidth = Math.max(1, Math.floor(2 * hr));
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
            }

            // X 마커 — 하나만 찍어도 보이는 신호. 흰 굵은 획을 먼저 깔아 캔들·격자 위에서도 떠 보이게.
            const r = MARK_RADIUS * Math.min(hr, vr);
            const strokeX = (p: ResolvedPoint): void => {
                ctx.beginPath();
                ctx.moveTo(p.x - r, p.y - r);
                ctx.lineTo(p.x + r, p.y + r);
                ctx.moveTo(p.x + r, p.y - r);
                ctx.lineTo(p.x - r, p.y + r);
                ctx.stroke();
            };
            ctx.setLineDash([]);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = Math.max(2, Math.floor(3.5 * hr));
            for (const p of pts) strokeX(p);
            ctx.strokeStyle = this._color;
            ctx.lineWidth = Math.max(1, Math.floor(1.8 * hr));
            for (const p of pts) strokeX(p);

            // 파생된 순번 — 사용자가 입력하지 않은 값이라 화면에서 확인할 수 있어야 한다.
            ctx.font = `${Math.round(10 * Math.min(hr, vr))}px -apple-system, system-ui, sans-serif`;
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            const pad = (MARK_RADIUS + 3) * hr; // X 획을 비켜 앉게
            for (let i = 0; i < pts.length; i++) {
                const label = String(i + 1);
                // 우측으로 넘치면 점 왼쪽에(화면 밖 방지 — 세로선 라벨과 같은 규칙).
                const overflow = pts[i].x + pad + ctx.measureText(label).width > scope.bitmapSize.width;
                ctx.textAlign = overflow ? "right" : "left";
                ctx.fillText(label, overflow ? pts[i].x - pad : pts[i].x + pad, pts[i].y);
            }
            ctx.restore();
        });
    }
}

class SkeletonPathPaneView {
    private _resolved: ResolvedPoint[] = [];
    constructor(private readonly _source: SkeletonPath) {}

    update(): void {
        const chart = this._source.chart;
        const series = this._source.series;
        if (!chart || !series) {
            this._resolved = [];
            return;
        }
        const ts = chart.timeScale();
        const out: ResolvedPoint[] = [];
        for (const p of this._source.points) {
            const x = ts.timeToCoordinate(p.time as unknown as Time);
            const y = series.priceToCoordinate(p.price);
            // 하나라도 해소 안 되면 그 점만 건너뛴다 — 로드된 캔들에서 이미 가격을 얻은 점들이라 드문 경우다.
            if (x !== null && y !== null) out.push({ x: x as number, y: y as number });
        }
        this._resolved = out;
    }

    renderer(): SkeletonPathRenderer {
        return new SkeletonPathRenderer(this._resolved, this._source.color);
    }

    zOrder(): "top" {
        return "top";
    }
}

export class SkeletonPath {
    chart: IChartApi | null = null;
    series: ISeriesApi<SeriesType> | null = null;
    points: SkeletonPointSpec[] = [];
    private readonly _paneViews: SkeletonPathPaneView[];
    private _requestUpdate?: () => void;

    constructor(readonly color: string) {
        this._paneViews = [new SkeletonPathPaneView(this)];
    }

    attached(param: { chart: IChartApi; series: ISeriesApi<SeriesType>; requestUpdate: () => void }): void {
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
    paneViews(): SkeletonPathPaneView[] {
        return this._paneViews;
    }
    setPoints(points: SkeletonPointSpec[]): void {
        this.points = points;
        this._requestUpdate?.();
    }
}

/** attachPrimitive/detachPrimitive 에 넘기기 위한 캐스트(fancy-canvas 타입 미노출 우회 — vertLine 과 동일). */
export function asSkeletonPrimitive(v: SkeletonPath): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}
