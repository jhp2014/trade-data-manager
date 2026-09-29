// 캔들 pane 높이 탐침 — 아무것도 안 그리고, 페인트마다 제 pane 높이를 재서 **바뀔 때만** 알린다.
//
// ## 왜 primitive 인가
// 거래대금 pane 의 윗변(= 캔들 pane 높이 + 구분선)에 DOM 을 붙이려면 그 경계를 알아야 하는데, 구분선은
// 끌어서 옮길 수 있고(layout.panes.enableResize) lightweight-charts 는 pane 크기 변경 이벤트를 안 준다.
// 컨테이너 ResizeObserver 는 구분선 드래그에 안 깨어난다. 페인트는 셋(리사이즈·드래그·확대) 모두에 돈다.
//
// ## 알림은 변할 때만
// draw() 는 pane 을 다시 그릴 때마다 돈다(데이터·스크롤·줌) — 같은 값이면 콜백을 안 불러 React 를 안 태운다.
import type { ISeriesPrimitive, Time } from "lightweight-charts";

// fancy-canvas 타입이 재노출되지 않아 최소 구조만 로컬 선언(dropLine.ts 와 같은 사정).
interface DrawTarget {
    useBitmapCoordinateSpace(f: (scope: { bitmapSize: { height: number }; verticalPixelRatio: number }) => void): void;
}

/** pane 구분선 두께(px) — lightweight-charts 내부 상수(SeparatorConstants.SeparatorHeight). */
export const PANE_SEPARATOR_PX = 1;

class PaneHeightRenderer {
    constructor(private readonly _source: PaneHeightProbe) {}
    draw(target: DrawTarget): void {
        target.useBitmapCoordinateSpace((scope) => {
            this._source.report(Math.round(scope.bitmapSize.height / scope.verticalPixelRatio));
        });
    }
}

class PaneHeightView {
    private readonly _renderer: PaneHeightRenderer;
    constructor(source: PaneHeightProbe) {
        this._renderer = new PaneHeightRenderer(source);
    }
    update(): void {}
    renderer(): PaneHeightRenderer {
        return this._renderer;
    }
}

export class PaneHeightProbe {
    private readonly _views: PaneHeightView[] = [new PaneHeightView(this)];
    private _last: number | null = null;
    constructor(private readonly _onChange: (height: number) => void) {}
    report(height: number): void {
        if (height === this._last) return;
        this._last = height;
        this._onChange(height);
    }
    updateAllViews(): void {}
    paneViews(): PaneHeightView[] {
        return this._views;
    }
}

export function asProbePrimitive(v: PaneHeightProbe): ISeriesPrimitive<Time> {
    return v as unknown as ISeriesPrimitive<Time>;
}
