// 상단 앵커 표식 층 — 그림 안 **최상단**에 종류 칩이 서고, 봉당 드롭선 하나가 제 봉까지 내려온다.
//
// ## 밴드/레인이 아니라 그림 안이다(사용자 확정)
// 위를 떼면 그림 높이가 표식 유무에 따라 출렁인다 — 거터 폭을 데이터가 아니라 토글이 정하게 한
// 그 규칙과 같은 이유로, 표식은 그림 위에 얹힌다(클립 안 — 팬하면 같이 잘린다). 상시, 토글 없음.
//
// ## 드롭선 규칙
//   · **봉당 하나** — 같은 봉에 표식이 여럿이면(기준+무시) 칩만 쌓이고 선은 하나다.
//   · 칩 무더기 바닥에서 시작해 봉 **고가에서 HIGH_GAP 떨어져** 끊긴다(원점 점선이 저가 아래서
//     시작하는 규칙의 거울). 자리가 없으면(봉이 화면 위쪽) 안 긋는다 — 억지로 그으면 봉을 파고든다.
//   · 고가를 모르면(캔들 결손) 안 긋는다 — 끝점을 지어내지 않는다. 칩의 x 정렬이 지목을 진다.
//   · 색은 주인 항목 색(색=주인, 글자=종류, x=봉). 후보(빈 칩)만의 봉은 선도 흐리다.
//
// ## 창 밖 앵커는 ◀▶ 칩만
// 드롭선은 x 를 주장하는 물건이라 x 가 화면에 없으면 안 긋는다 — 가장자리 칩이 "저 밖에 있다"까지만
// 말한다(원점 스택의 ◀▶ 클램프와 같은 문법). 정체는 툴팁이 진다.
import { HIGH_GAP, MARK_H, MARK_ROW_H, MARK_W, stackMarkRows, type NormMark } from "./anchorDisplay.js";
import type { NormLine } from "./overlay.js";

interface Box { left: number; top: number; width: number; height: number }

/** 한 주인 항목의 표식 한 벌 — 화면 x 환산(t − baseT)과 고가 조회에 주인 선이 필요하다. */
export interface MarkGroup {
    line: NormLine;
    color: string;
    marks: readonly NormMark[];
    /** 뷰 x 의 봉 고가(값 공간 %) — 캔들 결손이면 null(드롭선을 안 긋는다). */
    highAt: (x: number) => number | null;
}

/** 표식 칩이 상자 위변에서 떨어지는 여백(px). */
const TOP_PAD = 2;

export function AnchorMarksLayer({ groups, scales, box, clipId }: {
    groups: readonly MarkGroup[];
    scales: { x: (v: number) => number; y: (v: number) => number };
    box: Box;
    clipId: string;
}): JSX.Element {
    interface Placed { g: MarkGroup; m: NormMark; xv: number }
    const inView: { item: Placed; x: number }[] = [];
    const offLeft: Placed[] = [];
    const offRight: Placed[] = [];
    for (const g of groups) {
        for (const m of g.marks) {
            const xv = m.t - g.line.baseT;
            const sx = scales.x(xv);
            const p = { g, m, xv };
            if (sx < box.left) offLeft.push(p);
            else if (sx > box.left + box.width) offRight.push(p);
            else inView.push({ item: p, x: sx });
        }
    }
    // 계단식 쌓기 — 주인을 가로질러 한 목록(두 주인의 표식도 서로 부딪히면 안 겹쳐야 한다).
    const placed = stackMarkRows(inView);
    const chipY = (row: number): number => box.top + TOP_PAD + row * MARK_ROW_H;

    // 봉당 드롭선 하나 — 그 봉 칩 무더기의 **바닥**에서 출발한다(칩 종류와 무관하게 선은 하나).
    const byBar = new Map<string, { g: MarkGroup; xv: number; x: number; maxRow: number; solid: boolean }>();
    for (const p of placed) {
        const k = `${p.item.g.line.key}|${p.item.xv}`;
        const cur = byBar.get(k);
        if (cur) {
            cur.maxRow = Math.max(cur.maxRow, p.row);
            cur.solid = cur.solid || p.item.m.solid;
        } else {
            byBar.set(k, { g: p.item.g, xv: p.item.xv, x: p.x, maxRow: p.row, solid: p.item.m.solid });
        }
    }

    return (
        <g data-layer="anchor-marks" clipPath={`url(#${clipId})`}>
            {[...byBar.entries()].map(([k, b]) => {
                const high = b.g.highAt(b.xv);
                if (high === null) return null;
                const from = chipY(b.maxRow) + MARK_H + 2;
                const to = scales.y(high) - HIGH_GAP;
                if (to <= from) return null; // 봉이 칩에 붙었다 — 억지로 그으면 봉을 파고든다
                return (
                    <line key={`md-${k}`} x1={b.x} x2={b.x} y1={from} y2={to}
                        stroke={b.g.color} strokeWidth={0.9} strokeDasharray="3 3"
                        opacity={b.solid ? 0.8 : 0.45} style={{ pointerEvents: "none" }} />
                );
            })}
            {placed.map((p) => (
                <MarkChip key={`mc-${p.item.g.line.key}-${p.item.m.key}`} x={p.x} y={chipY(p.row)}
                    short={p.item.m.short} solid={p.item.m.solid} color={p.item.g.color} tip={p.item.m.tip} />
            ))}
            {offLeft.length > 0 && (
                <EdgeChip x={box.left + 2 + MARK_W / 2} y={chipY(0)} side="left" items={offLeft.map(tipOf)} color={offLeft[0].g.color} />
            )}
            {offRight.length > 0 && (
                <EdgeChip x={box.left + box.width - 2 - MARK_W / 2} y={chipY(0)} side="right" items={offRight.map(tipOf)} color={offRight[0].g.color} />
            )}
        </g>
    );
}

const tipOf = (p: { m: NormMark }): string => p.m.tip;

function MarkChip({ x, y, short, solid, color, tip }: {
    x: number; y: number; short: string; solid: boolean; color: string; tip: string;
}): JSX.Element {
    return (
        <g style={{ pointerEvents: "all" }}>
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

/** 창 밖 표식의 가장자리 칩 — 개수와 방향만. x 를 주장하지 않으므로 드롭선은 없다. */
function EdgeChip({ x, y, side, items, color }: {
    x: number; y: number; side: "left" | "right"; items: readonly string[]; color: string;
}): JSX.Element {
    const label = side === "left" ? `◀${items.length > 1 ? items.length : ""}` : `${items.length > 1 ? items.length : ""}▶`;
    return (
        <g style={{ pointerEvents: "all" }}>
            <title>{`창 밖 표식 ${items.length}개\n${items.join("\n")}`}</title>
            <rect x={x - MARK_W / 2} y={y} width={MARK_W} height={MARK_H} rx={3}
                fill="var(--bg-primary)" fillOpacity={0.92} stroke={color} strokeWidth={0.7} />
            <text x={x} y={y + 9.5} textAnchor="middle" style={{ fontSize: 8, fill: color }}>{label}</text>
        </g>
    );
}
