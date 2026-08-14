// 축 층 — 눈금(격자+숫자)과 원점 좌표축(0선·t=0선). 그림보다 **아래** SVG 에 산다(층 순서 테스트).
//
// 눈금은 확대하면 d3 가 새 구간에 맞춰 다시 뽑는다(축이 곧 정보라 라벨이 따라와야 한다).
// 타점을 하나 선택했으면(abs) **절대값을 아랫줄에** 같이 세운다(사용자 확정): 세로축은 전일比 %,
// 가로축은 벽시계. 한 줄에 붙이면 좁은 왼쪽 여백(46px)을 넘어 잘린다 — 그래서 두 줄이다.
import type { CSSProperties } from "react";
import { fmtPct } from "../../lib/format.js";
import { timeOfMinutes } from "../../lib/date.js";

/** 원점 좌표축의 색 — 눈금 격자(border-subtle)보다 진하고 골격 색과는 겹치지 않는 중성색. */
const AXIS_LINE = "var(--text-secondary)";

/** 이 층이 쓰는 스케일 — d3 ScaleLinear 의 구조적 부분집합. */
interface Scale {
    (v: number): number;
    ticks: (n: number) => number[];
}

export function AxisLayer({ scales, box, sizeH, fmtX, abs, clipId }: {
    scales: { x: Scale; y: Scale };
    box: { left: number; top: number; width: number; height: number };
    /** SVG 전체 높이 — x 눈금 숫자가 상자 밖 아래 여백에 선다. */
    sizeH: number;
    /** x 값 표기(단위 적용된 것) — 일봉 "N일" / 분봉 "N분". */
    fmtX: (v: number) => string;
    /** 선택된 타점의 원점 — 있으면 절대값(벽시계·전일比 %)을 아랫줄에 같이 세운다. */
    abs: { baseT: number; baseRate: number } | null;
    clipId: string;
}): JSX.Element {
    return (
        <>
            <g data-layer="axis-ticks">
            {scales.y.ticks(5).map((v) => (
                <g key={`y${v}`}>
                    <line x1={box.left} x2={box.left + box.width} y1={scales.y(v)} y2={scales.y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
                    <text x={box.left - 5} y={scales.y(v) + (abs ? -1 : 3)} textAnchor="end" style={axisText}>{v.toFixed(0)}%</text>
                    {abs && (
                        <text x={box.left - 5} y={scales.y(v) + 9} textAnchor="end" style={axisAbsText}>{fmtPct(v + abs.baseRate)}</text>
                    )}
                </g>
            ))}
            {scales.x.ticks(6).map((v) => (
                <g key={`x${v}`}>
                    <text x={scales.x(v)} y={sizeH - (abs ? 14 : 8)} textAnchor="middle" style={axisText}>{fmtX(v)}</text>
                    {abs && <text x={scales.x(v)} y={sizeH - 4} textAnchor="middle" style={axisAbsText}>{timeOfMinutes(v + abs.baseT)}</text>}
                </g>
            ))}
            </g>
            <g clipPath={`url(#${clipId})`}>
                {/* 원점 좌표축 — **실선 + 끝 화살표**(사용자 확정, xy 좌표계 그대로). 흐린 점선은 그림에
                    묻혀 안 읽혔다. 이 두 선이 피벗 좌표를 읽는 자(尺)다: 값은 여기로 내린 수직·수평
                    점선의 발치에서 읽는다. 가로축 = 0(일봉이면 앵커 높이, 분봉이면 타점의 등락률 높이),
                    세로축 = t=0(분봉이면 타점 시각). */}
                <line x1={box.left} x2={box.left + box.width} y1={scales.y(0)} y2={scales.y(0)} stroke={AXIS_LINE} strokeWidth={1} />
                <polygon points={`${box.left + box.width},${scales.y(0)} ${box.left + box.width - 7},${scales.y(0) - 3.5} ${box.left + box.width - 7},${scales.y(0) + 3.5}`} fill={AXIS_LINE} />
                <line x1={scales.x(0)} x2={scales.x(0)} y1={box.top} y2={box.top + box.height} stroke={AXIS_LINE} strokeWidth={1} />
                <polygon points={`${scales.x(0)},${box.top} ${scales.x(0) - 3.5},${box.top + 7} ${scales.x(0) + 3.5},${box.top + 7}`} fill={AXIS_LINE} />
            </g>
        </>
    );
}

const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
/** 눈금 아랫줄의 절대값 — 상대값(주)보다 한 단계 작고 흐리다. 둘이 같은 무게면 어느 쪽이 축인지 안 잡힌다. */
const axisAbsText: CSSProperties = { fontSize: 8.5, fill: "var(--text-quaternary, var(--text-tertiary))", opacity: 0.75, fontVariantNumeric: "tabular-nums" };
