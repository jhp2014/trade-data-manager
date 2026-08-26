// 앵커 표식 칩(SVG) — 정규화 패널과 차트 패널이 같은 글리프를 쓴다.
//
// 순수 프레젠테이션이라 lib/ 이 아니라 여기 산다: 좌표(x·y)와 색은 부르는 층이 정하고, 이 파일은
// "채운 칩 / 빈 칩"과 툴팁의 생김새만 안다. **캔버스가 아니라 SVG 인 이유**는 툴팁(`<title>`)과
// 클릭이 필요해서다 — 가격축까지 따라야 하는 드롭선은 반대 이유로 캔버스 primitive 로 갈린다.
import { MARK_H, MARK_W } from "../lib/anchorMarks.js";

/** 표식 칩 하나 — x 는 **중심**, y 는 윗변. */
export function MarkChip({ x, y, short, solid, color, tip, onContextMenu }: {
    x: number; y: number; short: string; solid: boolean; color: string; tip: string;
    onContextMenu?: (e: React.MouseEvent) => void;
}): JSX.Element {
    return (
        <g style={{ pointerEvents: "all" }} onContextMenu={onContextMenu}>
            <title>{tip}</title>
            <rect x={x - MARK_W / 2} y={y} width={MARK_W} height={MARK_H} rx={3}
                fill={solid ? color : "var(--bg-primary)"} fillOpacity={solid ? 1 : 0.92}
                stroke={color} strokeWidth={solid ? 0 : 0.7} />
            <text x={x} y={y + 9.5} textAnchor="middle"
                style={{ fontSize: 8, fill: solid ? "var(--bg-primary)" : color, fontWeight: solid ? 700 : 400 }}>
                {short}
            </text>
        </g>
    );
}

/**
 * 창 밖 표식의 가장자리 칩 — 개수와 방향만. x 를 주장하지 않으므로 드롭선은 없다(정체는 툴팁이 진다).
 * `onClick` 이 있으면 커서가 손가락이 된다 — 차트는 눌러서 그 봉으로 가로 스크롤한다.
 */
export function EdgeChip({ x, y, side, items, color, onClick }: {
    x: number; y: number; side: "left" | "right"; items: readonly string[]; color: string;
    onClick?: () => void;
}): JSX.Element {
    const label = side === "left" ? `◀${items.length > 1 ? items.length : ""}` : `${items.length > 1 ? items.length : ""}▶`;
    return (
        <g style={{ pointerEvents: "all", cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
            <title>{`창 밖 표식 ${items.length}개${onClick ? "(누르면 그리로 이동)" : ""}\n${items.join("\n")}`}</title>
            <rect x={x - MARK_W / 2} y={y} width={MARK_W} height={MARK_H} rx={3}
                fill="var(--bg-primary)" fillOpacity={0.92} stroke={color} strokeWidth={0.7} />
            <text x={x} y={y + 9.5} textAnchor="middle" style={{ fontSize: 8, fill: color }}>{label}</text>
        </g>
    );
}
