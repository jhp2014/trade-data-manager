// 표시목록을 **캔버스로** 옮기는 페인터 — 판단은 없다, 형식만 바꾼다.
//
// 표시목록(drawList)이 "무엇을 어디에" 를 들고, 이 파일이 "어떻게 칠하나" 만 안다. 잠깐 SVG 페인터가
// 짝으로 있었지만(전환 중 같은 목록을 두 형식으로 그려 화면이 안 바뀌는 걸 확인하는 용도) 지금은 없다 —
// 쓰지 않는 페인터를 남겨 두면 목록의 계약이 둘 사이에서 조용히 갈라진다.
//
// ## 왜 캔버스인가
// 팬 한 프레임의 비용을 정하는 건 점 수가 아니라 **DOM 노드 수**였다(panCost 벤치).
// 캔버스는 노드가 0이라 React 재조정도 DOM 쓰기도 없다 — 남는 건 좌표 재계산뿐이고 그건 어차피 든다.
//
// ## 그리는 건 React 밖이다
// 목록이 바뀌면 effect 에서 `ctx` 에 직접 그린다. 컴포넌트 자신은 다시 렌더되지만 **자식이 없어**
// 재조정할 게 없다. 이게 react-konva 같은 리테인드 캔버스와 갈리는 지점이다(그쪽은 노드를 그대로 들고 간다).
//
// ## CSS 변수는 캔버스가 못 읽는다
// `ctx.strokeStyle = "var(--text-tertiary)"` 는 파싱에 실패하고 **직전 색이 그대로 남는다**(조용히 틀린다).
// 그래서 칠하기 전에 실제 색으로 풀어 준다. 한 프레임에 한 번 `getComputedStyle` 을 잡고 변수마다
// 값을 읽어 캐시한다 — 테마(밝음/어둠)가 바뀌어도 다음 프레임에 저절로 따라온다.
//
// ## 묶음 투명도는 op 마다 걸린다 — 한 군데서 SVG 와 미세하게 다르다
// SVG `<g opacity>` 는 자식을 한 번 합성한 뒤 알파를 걸지만, 캔버스는 op 마다 `globalAlpha` 라
// **겹친 자리가 더 진해진다**. 지금 겹치는 건 골격선 위의 피벗 점 하나뿐이고, 그것도 짚은 선
// (알파 1 — 차이 없음)이 아닌 경우에만이다. 캔들 꼬리는 몸통에 가리던 것을 빌더에서 두 토막으로
// 갈라 아예 안 겹치게 했다. 묶음마다 오프스크린을 뜨는 건 선 수만큼 캔버스를 만드는 짓이라 안 한다.
import { useEffect, useRef } from "react";
import type { DrawLayer, DrawOp, FlatPts } from "./drawList.js";

interface Box { left: number; top: number; width: number; height: number }

/** `var(--x)` 를 실제 색으로 — 아니면 그대로 돌려준다(리터럴 색). */
function colorResolver(el: Element): (c: string) => string {
    const cs = getComputedStyle(el);
    const cache = new Map<string, string>();
    return (c: string): string => {
        if (!c.startsWith("var(")) return c;
        const hit = cache.get(c);
        if (hit !== undefined) return hit;
        const name = c.slice(4, -1).trim();
        // 못 찾으면 눈에 띄는 색 대신 **투명**으로 — 조용히 엉뚱한 색으로 칠하느니 안 보이는 게 낫다
        // (빠진 변수는 화면에서 바로 드러난다).
        const v = cs.getPropertyValue(name).trim() || "transparent";
        cache.set(c, v);
        return v;
    };
}

function stroke(ctx: CanvasRenderingContext2D, pts: FlatPts): void {
    if (pts.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
}

/** SVG `strokeDasharray` 문자열 → 캔버스 `setLineDash` 배열. */
const dashOf = (d: string | undefined): number[] =>
    d === undefined ? [] : d.split(/[\s,]+/).filter(Boolean).map(Number);

const ALIGN = { start: "left", middle: "center", end: "right" } as const;

function paintOp(
    ctx: CanvasRenderingContext2D,
    o: DrawOp,
    color: (c: string) => string,
    family: string,
    groupAlpha: number,
): void {
    switch (o.op) {
        case "polyline":
            ctx.globalAlpha = groupAlpha * (o.opacity ?? 1);
            ctx.strokeStyle = color(o.stroke);
            ctx.lineWidth = o.width;
            ctx.lineCap = o.cap ?? "butt";
            ctx.lineJoin = o.join ?? "miter";
            ctx.setLineDash(dashOf(o.dash));
            stroke(ctx, o.pts);
            ctx.setLineDash([]);
            return;
        case "line":
            ctx.globalAlpha = groupAlpha * (o.opacity ?? 1);
            ctx.strokeStyle = color(o.stroke);
            ctx.lineWidth = o.width;
            ctx.lineCap = "butt";
            ctx.setLineDash(dashOf(o.dash));
            ctx.beginPath();
            ctx.moveTo(o.x1, o.y1);
            ctx.lineTo(o.x2, o.y2);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        case "rect":
            ctx.globalAlpha = groupAlpha;
            ctx.fillStyle = color(o.fill);
            ctx.fillRect(o.x, o.y, o.w, o.h);
            return;
        case "circle":
            ctx.globalAlpha = groupAlpha;
            ctx.beginPath();
            ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
            if (o.fill !== undefined) {
                ctx.fillStyle = color(o.fill);
                ctx.fill();
            }
            if (o.stroke !== undefined) {
                ctx.strokeStyle = color(o.stroke);
                ctx.lineWidth = o.width ?? 1;
                ctx.setLineDash([]);
                ctx.stroke();
            }
            return;
        case "text":
            ctx.globalAlpha = groupAlpha;
            ctx.font = `${o.weight ?? 400} ${o.size}px ${family}`;
            ctx.textAlign = ALIGN[o.anchor];
            // SVG 는 y 가 베이스라인 — 캔버스 기본값(alphabetic)이 같은 뜻이다.
            ctx.textBaseline = "alphabetic";
            if (o.halo) {
                // paintOrder="stroke" 와 같은 순서 — 테두리를 먼저 두르고 그 위에 글자.
                ctx.strokeStyle = color(o.halo.color);
                ctx.lineWidth = o.halo.width;
                ctx.lineJoin = "round";
                ctx.setLineDash([]);
                ctx.strokeText(o.text, o.x, o.y);
            }
            ctx.fillStyle = color(o.fill);
            ctx.fillText(o.text, o.x, o.y);
            return;
    }
}

/**
 * 관측 창구 — 마지막으로 그린 표시목록을 캔버스 노드에 매달아 둔다.
 *
 * SVG 를 쓸 때는 devtools 로 요소를 집어 좌표·색·순서를 눈으로 확인하고 그 자리에서 고쳤다. 캔버스는
 * 불투명한 사각형이라 그게 통째로 사라진다 — 그 손실을 메우는 자리다. 콘솔에서
 * `$0.__drawList` 로 들여다보고, 화면 테스트도 같은 창구로 그림을 확인한다(DOM 을 세던 것 대신).
 *
 * 그리기와 무관한 곁가지라 화면에 아무 영향이 없다.
 */
interface CanvasWithList extends HTMLCanvasElement { __drawList?: readonly DrawLayer[] }

/** 캔버스 노드가 마지막으로 그린 표시목록 — 없으면 null. */
export function drawListOf(el: Element | null | undefined): readonly DrawLayer[] | null {
    return (el as CanvasWithList | null | undefined)?.__drawList ?? null;
}

/** 목록 전체의 op 들을 한 줄로 — 테스트·디버깅이 "무엇이 그려졌나"를 물을 때. */
export function opsOf(layers: readonly DrawLayer[] | null): DrawOp[] {
    return (layers ?? []).flatMap((l) => l.groups.flatMap((g) => g.ops));
}

export interface CanvasLayersProps {
    /** 그릴 층들 — **순서가 곧 그리는 순서**다(먼저가 아래). */
    layers: readonly DrawLayer[];
    width: number;
    height: number;
    /** 그림 상자 — SVG `clipPath` 와 같은 자리로 자른다. null 이면 안 자른다. */
    clip: Box | null;
}

/**
 * 그림 층들을 캔버스 한 장에. **포인터를 안 받는다** — 손짓은 위에 얹힌 SVG·HTML 층의 몫이고,
 * 그 규약이 이 전환이 조작을 하나도 안 건드리는 이유다.
 *
 * `data-layers`·`data-ops` 는 **관측용**이다. 캔버스는 devtools 로 안을 못 들여다보므로 무엇을 몇 개
 * 그렸는지라도 남긴다 — 화면 테스트가 "빈 캔버스를 상대로 통과"하지 않게 잡아 주는 것도 이 값이다.
 */
export function CanvasLayers({ layers, width, height, clip }: CanvasLayersProps): JSX.Element {
    const ref = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        // 관측 창구를 먼저 채운다 — 컨텍스트가 없어도(jsdom) 무엇을 그리려 했는지는 남아야 한다.
        (canvas as CanvasWithList).__drawList = layers;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // 물리 픽셀로 잡고 논리 픽셀로 그린다 — 안 하면 고해상도 화면에서 뭉갠다.
        const dpr = window.devicePixelRatio || 1;
        const pw = Math.max(1, Math.round(width * dpr));
        const ph = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== pw) canvas.width = pw;
        if (canvas.height !== ph) canvas.height = ph;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const color = colorResolver(canvas);
        const family = getComputedStyle(canvas).fontFamily || "sans-serif";

        ctx.save();
        if (clip) {
            ctx.beginPath();
            ctx.rect(clip.left, clip.top, clip.width, clip.height);
            ctx.clip();
        }
        for (const layer of layers) {
            for (const g of layer.groups) {
                const alpha = g.opacity ?? 1;
                for (const op of g.ops) paintOp(ctx, op, color, family, alpha);
            }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
    }, [layers, width, height, clip]);

    const ops = layers.reduce((n, l) => n + l.groups.reduce((m, g) => m + g.ops.length, 0), 0);

    return (
        <canvas ref={ref}
            data-layers={layers.map((l) => l.name).join(",")}
            data-ops={ops}
            style={{ position: "absolute", inset: 0, width, height, pointerEvents: "none" }} />
    );
}
