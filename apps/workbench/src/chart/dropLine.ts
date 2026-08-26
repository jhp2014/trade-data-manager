// 앵커 표식의 **드롭선** — 상단 칩 무더기 바닥에서 제 봉까지 내려오는 짧은 세로 파선.
//
// ## 왜 오버레이가 아니라 프리미티브인가
// 칩과 요구가 정반대다. 칩은 툴팁·클릭이 필요하고 x(timeScale)만 알면 되지만, 드롭선은 상호작용이
// 없고 **가격축까지 따라야 한다** — DOM 오버레이의 재계산 신호(subscribeVisibleLogicalRangeChange)는
// 가격축만 바뀌는 조작(가격축 드래그·autoscale 재계산)에 안 깨어나서 끝점이 봉을 놓친 채 남는다.
//
// ## `update()` 가 아니라 `draw()` 에서 좌표를 푼다 (VertLines 와 다른 점)
// lightweight-charts 가 가격축 변경에 `updateAllViews` 를 부른다는 보장이 없다. 페인트 시점에 풀면
// 그 보장이 필요 없다 — x 와 y 를 둘 다 draw 안에서 읽는다.
//
// ## 시작점은 픽셀, 끝점은 가격
// 시작 y(`fromY`)는 pane 상단 기준 픽셀이다 — 칩 무더기의 바닥이라 **가격 스케일과 무관**하고,
// 계단식 쌓기는 React 가 이미 한 번 계산했다(같은 계산을 여기서 또 하지 않는다).
// 끝점은 봉의 고가(시리즈 축 단위: 일봉=원, 분봉=%)에서 `gap` 만큼 떨어져 끊긴다. `gap` 에는 그 봉의
// 기존 마커(등락률·거래대금 원 칩) 높이 예약분이 들어온다 — 안 그러면 선이 마커를 뚫는다.
// 자리가 없으면(끝이 시작보다 위) **안 긋는다** — 억지로 그으면 봉을 파고든다.
import type { IChartApi, ISeriesApi, ISeriesPrimitive, Time } from "lightweight-charts";

// fancy-canvas 타입이 lightweight-charts 에서 재노출되지 않아 최소 구조만 로컬 선언(우리가 쓰는 필드만).
interface BitmapScope {
    context: CanvasRenderingContext2D;
    bitmapSize: { width: number; height: number };
    horizontalPixelRatio: number;
    verticalPixelRatio: number;
}
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: BitmapScope) => void): void;
}

/** 드롭선 하나 — 봉(time)과 그 봉의 고가(value, 시리즈 축 단위), 시작 y(px)와 색. */
export interface DropLineSpec {
    time: Time;
    /** 끝점을 만들 값 — 시리즈 가격 축 단위(일봉=원, 분봉=%). */
    value: number;
    /** 칩 무더기 바닥의 y(px, pane 상단 기준). */
    fromY: number;
    /** 값에서 떨어질 간격(px) — HIGH_GAP + (그 봉에 마커가 있으면) 마커 예약분. */
    gap: number;
    color: string;
    /** 후보(빈 칩)만의 봉은 선도 흐리다. */
    opacity: number;
}

class DropLinesPaneRenderer {
    constructor(private readonly _source: DropLines) {}
    draw(target: DrawTarget): void {
        const chart = this._source.chart;
        const series = this._source.series;
        const specs = this._source.lines;
        if (!chart || !series || specs.length === 0) return;
        const ts = chart.timeScale();
        target.useBitmapCoordinateSpace((scope) => {
            const ctx = scope.context;
            const hr = scope.horizontalPixelRatio;
            const vr = scope.verticalPixelRatio;
            ctx.save();
            const dash = 3 * Math.max(hr, vr);
            ctx.setLineDash([dash, dash]);
            ctx.lineWidth = Math.max(1, Math.round(0.9 * hr));
            for (const s of specs) {
                // 좌표는 **매 페인트에** 푼다 — 가격축만 바뀌는 조작에도 끝점이 따라오도록.
                const x = ts.timeToCoordinate(s.time);
                const y = series.priceToCoordinate(s.value);
                if (x === null || y === null) continue; // 그 봉이 시리즈에 없거나 축 밖 — 지어내지 않는다
                const to = (y as number) - s.gap;
                if (to <= s.fromY) continue; // 봉이 칩에 붙었다 — 억지로 그으면 봉을 파고든다
                const px = Math.round((x as number) * hr) + 0.5;
                ctx.globalAlpha = s.opacity;
                ctx.strokeStyle = s.color;
                ctx.beginPath();
                ctx.moveTo(px, s.fromY * vr);
                ctx.lineTo(px, to * vr);
                ctx.stroke();
            }
            ctx.restore();
        });
    }
}

class DropLinesPaneView {
    constructor(private readonly _source: DropLines) {}
    /** 해소를 draw 로 미뤘으므로 여기서 할 일이 없다 — 존재 자체가 계약(paneViews 가 view 를 요구한다). */
    update(): void {}
    renderer(): DropLinesPaneRenderer {
        return new DropLinesPaneRenderer(this._source);
    }
    zOrder(): "top" {
        return "top";
    }
}

export class DropLines {
    chart: IChartApi | null = null;
    series: ISeriesApi<"Candlestick"> | null = null;
    lines: DropLineSpec[] = [];
    private readonly _paneViews: DropLinesPaneView[];
    private _requestUpdate?: () => void;

    constructor() {
        this._paneViews = [new DropLinesPaneView(this)];
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
    paneViews(): DropLinesPaneView[] {
        return this._paneViews;
    }
    setLines(lines: DropLineSpec[]): void {
        this.lines = lines;
        this._requestUpdate?.();
    }
}

/** attachPrimitive/detachPrimitive 에 넘기기 위한 캐스트(fancy-canvas 타입 미노출 우회 — vertLine 과 같은 이유). */
export function asDropPrimitive(v: DropLines): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}
