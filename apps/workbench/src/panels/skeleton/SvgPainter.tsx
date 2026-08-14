// 표시목록을 **SVG 로** 옮기는 페인터 — 판단은 없다, 형식만 바꾼다.
//
// 캔버스 페인터가 생기면 이 파일의 짝이 된다: 같은 `DrawLayer[]` 를 받아 `ctx` 에 그린다.
// 그때 갈아끼우는 건 이 파일 하나고 빌더·테스트는 그대로다 — 그러라고 목록을 만든 것이다.
import type { DrawLayer, DrawOp, FlatPts } from "./drawList.js";

/**
 * 폴리라인 points 속성 — 소수 2자리로 끊어 문자열이 불필요하게 길어지지 않게(기존 pathOf 와 같은 규칙).
 * 평평한 배열을 두 칸씩 읽는다. `map().join()` 대신 손으로 잇는 이유는 중간 배열을 안 만들려는 것 —
 * 프레임마다 도는 자리다.
 */
function pointsAttr(pts: FlatPts): string {
    let s = "";
    for (let i = 0; i < pts.length; i += 2) {
        if (i > 0) s += " ";
        s += `${pts[i].toFixed(2)},${pts[i + 1].toFixed(2)}`;
    }
    return s;
}

function paintOp(o: DrawOp, key: number): JSX.Element {
    switch (o.op) {
        case "polyline":
            return (
                <polyline key={key} points={pointsAttr(o.pts)} fill="none"
                    stroke={o.stroke} strokeWidth={o.width}
                    strokeDasharray={o.dash} strokeLinecap={o.cap} strokeLinejoin={o.join}
                    opacity={o.opacity} />
            );
        case "line":
            return (
                <line key={key} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2}
                    stroke={o.stroke} strokeWidth={o.width} strokeDasharray={o.dash} opacity={o.opacity} />
            );
        case "rect":
            return <rect key={key} x={o.x} y={o.y} width={o.w} height={o.h} fill={o.fill} />;
        case "circle":
            return <circle key={key} cx={o.cx} cy={o.cy} r={o.r} fill={o.fill} stroke={o.stroke} strokeWidth={o.width} />;
        case "text":
            return (
                <text key={key} x={o.x} y={o.y} textAnchor={o.anchor}
                    stroke={o.halo?.color} strokeWidth={o.halo?.width} paintOrder={o.halo ? "stroke" : undefined}
                    style={{ fontSize: o.size, fill: o.fill, fontWeight: o.weight, fontVariantNumeric: "tabular-nums" }}>
                    {o.text}
                </text>
            );
    }
}

/**
 * 층 하나. 비어 있어도 **자리는 남긴다** — 그리는 순서가 켜고 끔에 따라 달라지면 순서 규약을 잴 수가 없다
 * (층 순서 테스트가 이 빈 자리까지 확인한다).
 *
 * 순수 그림이라 포인터를 안 받는다 — 손잡이는 라벨·히트 층의 몫이고, 그 규약이 캔버스 전환의 전제다.
 */
export function SvgLayer({ layer }: { layer: DrawLayer }): JSX.Element {
    return (
        <g data-layer={layer.name} style={{ pointerEvents: "none" }}>
            {layer.groups.map((g, i) => (
                <g key={i} opacity={g.opacity}>
                    {g.ops.map(paintOp)}
                </g>
            ))}
        </g>
    );
}
