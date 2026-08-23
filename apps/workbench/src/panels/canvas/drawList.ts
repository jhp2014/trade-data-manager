// 표시목록 — **무엇을 어디에 그리나**를 그리는 수단(SVG·캔버스)과 갈라 놓은 층.
// (골격 겹쳐 그리기에서 태어나 테이프가 물려받았다 — 층 개념·평평한 좌표·묶음 합성 규약이 본론이다.)
//
// ## 왜 있나
// 순수 그림 층은 팬 한 프레임마다 통째로 다시 그려진다. JSX 면 프레임마다 React 재조정 + DOM 쓰기가
// 따라붙는데, 실측으로 **비용을 정하는 건 점 수가 아니라 DOM 노드 수**였다(panCost 벤치).
// 노드를 0으로 만들려면 캔버스로 가야 하고, 그러려면 그림이 JSX 가 아니라 **데이터**여야 한다.
//
// ## 계약
//  · 빌더는 **순수 함수**다 — 같은 입력이면 같은 목록. React 도 DOM 도 모른다.
//  · 목록의 **순서가 곧 그리는 순서**다(먼저가 아래). 층 순서 규약이 여기서 검사된다.
//  · 페인터는 목록을 받아 제 형식으로만 옮긴다 — 판단하지 않는다.
//
// ## 묶음(group)이 있는 이유 — 투명도는 **합쳐서** 걸린다
// SVG `<g opacity>` 는 자식들을 한 번 합성한 뒤 알파를 건다. 캔들 꼬리가 몸통에 가리는 것처럼
// **겹치는 두 도형**은 이게 op 별 알파와 결과가 다르다(op 별로 걸면 겹친 데가 더 진해진다).
// 그래서 묶음을 목록의 개념으로 남긴다 — SVG 페인터는 `<g opacity>` 로 그대로 옮기고,
// 캔버스 페인터는 겹침이 문제되는 묶음만 오프스크린으로 합성하면 된다(그 판단을 페인터에 남긴다).

export interface Pt { x: number; y: number }

/**
 * 폴리라인 좌표는 **평평한 수 배열**이다 — `[x0,y0, x1,y1, …]`.
 *
 * `{x,y}` 객체 배열로 두면 프레임마다 점 수만큼 객체가 새로 생긴다(테마 선 30개 × 600점이면 18,000개).
 * 프레임 비용을 줄이려고 만든 층이 GC 부담을 새로 만드는 꼴이라 평평하게 눕힌다. 페인터 양쪽 다
 * 이 형태를 그대로 쓴다 — SVG 는 두 칸씩 읽어 문자열을 잇고, 캔버스는 두 칸씩 `lineTo` 한다.
 */
export type FlatPts = readonly number[];

/** 값 공간의 점들을 **한 번에** 화면 좌표 평평한 배열로 — 빌더들이 공유하는 뜨거운 함수다. */
export function flatten(
    points: readonly Pt[],
    sx: (v: number) => number,
    sy: (v: number) => number,
): number[] {
    const out = new Array<number>(points.length * 2);
    for (let i = 0; i < points.length; i++) {
        out[i * 2] = sx(points[i].x);
        out[i * 2 + 1] = sy(points[i].y);
    }
    return out;
}

/** 한 도형. 좌표는 전부 **화면 px**(스케일을 이미 통과한 값)다 — 페인터는 변환하지 않는다. */
export type DrawOp =
    | {
        op: "polyline";
        pts: FlatPts;
        stroke: string;
        width: number;
        /** SVG `strokeDasharray` 와 같은 뜻 — 캔버스는 `setLineDash` 로 옮긴다. */
        dash?: string;
        opacity?: number;
        cap?: "round";
        join?: "round";
    }
    | { op: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; width: number; dash?: string; opacity?: number }
    | { op: "rect"; x: number; y: number; w: number; h: number; fill: string }
    | { op: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; width?: number }
    | {
        op: "text";
        x: number; y: number; text: string;
        anchor: "start" | "middle" | "end";
        fill: string;
        size: number;
        weight?: number;
        /** 글자 뒤 테두리(배경색으로 둘러 읽히게) — SVG 는 paintOrder=stroke, 캔버스는 strokeText 먼저. */
        halo?: { color: string; width: number };
    };

/** 한 번에 합성되는 도형 묶음 — 투명도가 걸리는 단위다(머리 주석 참고). */
export interface DrawGroup {
    opacity?: number;
    ops: readonly DrawOp[];
}

/** 이름 붙은 한 층 — 이름은 `data-layer` 로 나가고 순서 검사가 이걸 본다. */
export interface DrawLayer {
    name: string;
    groups: readonly DrawGroup[];
}

/** 빈 묶음·빈 층을 걸러 낸다 — 목록에 빈 껍데기가 쌓이면 순서 검사가 읽기 나빠진다. */
export const compact = (groups: readonly DrawGroup[]): DrawGroup[] =>
    groups.filter((g) => g.ops.length > 0);

/**
 * 그림 층의 **그리는 순서** — 먼저가 아래. 순서는 미학이 아니라 뜻이다:
 *   · 캔들이 맨 아래 — 선이 그 위를 지나야 "선이 원본의 어디를 밟았나"가 읽힌다.
 *   · 테마 선이 정규화 선보다 아래 — 배경이고 주인공은 내 선이다.
 * **세 층은 반드시 붙어 있어야 한다** — 캔버스 한 장이 스택 자리 하나를 차지하므로,
 * 사이에 DOM 층이 끼면 순서를 재현할 수 없다(손짓 층은 이 뭉치 뒤로 나가 있다).
 */
export const PAINT_ORDER = ["candles", "theme-lines", "lines"] as const;
export type PaintName = typeof PAINT_ORDER[number];

/** 이름표 붙은 층들을 **정해진 순서로** — 부르는 자리가 순서를 못 정하게 한다. */
export const orderPaint = (byName: Record<PaintName, DrawLayer>): DrawLayer[] =>
    PAINT_ORDER.map((name) => byName[name]);
