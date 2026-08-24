// 축 층 — 눈금(격자+숫자)과 원점 0선·사건 표식. 그림보다 **아래** SVG 에 산다(층 순서 테스트).
//
// 눈금은 확대하면 d3 가 새 구간에 맞춰 다시 뽑는다(축이 곧 정보라 라벨이 따라와야 한다).
// 타점을 하나 선택했으면(abs) **절대값을 아랫줄에** 같이 세운다(사용자 확정): 세로축은 전일比 %,
// 가로축은 벽시계. 한 줄에 붙이면 좁은 축 여백(46px)을 넘어 잘린다 — 그래서 두 줄이다.
//
// ## y 눈금은 **오른쪽**이다(사용자 확정)
// 차트 패널(lightweight-charts)이 rightPriceScale 이라 손이 같은 자리를 찾고, **이름 거터**가 그
// 바깥에 붙어 이름·값·눈금이 한 쪽에서 읽힌다. 왼쪽은 통째로 그림(과거)에 돌려줬다.
//
// ## 원점을 말하는 건 **격자 세로선 하나**뿐이다(나머지는 원점 스택이 진다)
// 처음엔 실선 1px + 화살촉이었다(너무 셌다 — 그림을 덮었다). 그 다음엔 통째로 지웠다(이번엔 기준이
// 어디인지 안 보였다 — 사용자 지적). 지금 이 층에 남은 건 y 격자와 **같은 규격**의 세로선(border-subtle
// 0.5px)이고, 위치와 정체는 바닥의 **원점 스택 + 세로 점선**(OriginStack)이 진다 — 그쪽이 항목별로
// 날짜·시각을 적으므로 축에 칩 하나를 세우던 옛 방식보다 정확하다(여러 날을 겹치면 원점이 항목마다 다르다).
// 가로 0선은 그대로 값이다(일봉 = 전일 종가, 분봉 = 타점 시각의 등락률)라 중성색 실선을 유지한다.
import type { CSSProperties } from "react";
import { fmtPct } from "../../lib/format.js";
import { timeOfMinutes } from "../../lib/date.js";

/** 0선·사건 표식의 색 — 눈금 격자(border-subtle)보다 진하고 선 색과는 겹치지 않는 중성색. */
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
    // 눈금 숫자는 상자 **오른쪽 밖**(y 축 여백)에 선다.
    const tickX = box.left + box.width + 5;
    return (
        <>
            <g data-layer="axis-ticks">
            {scales.y.ticks(5).map((v) => (
                <g key={`y${v}`}>
                    <line x1={box.left} x2={box.left + box.width} y1={scales.y(v)} y2={scales.y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
                    <text x={tickX} y={scales.y(v) + (abs ? -1 : 3)} textAnchor="start" style={axisText}>{v.toFixed(0)}%</text>
                    {abs && (
                        <text x={tickX} y={scales.y(v) + 9} textAnchor="start" style={axisAbsText}>{fmtPct(v + abs.baseRate)}</text>
                    )}
                </g>
            ))}
            {scales.x.ticks(6).map((v) => (
                <g key={`x${v}`}>
                    <text x={scales.x(v)} y={sizeH - (abs ? 14 : 8)} textAnchor="middle" style={axisText}>{fmtX(v)}</text>
                    {abs && <text x={scales.x(v)} y={sizeH - 4} textAnchor="middle" style={axisAbsText}>{timeOfMinutes(v + abs.baseT)}</text>}
                </g>
            ))}
            {/* 원점 세로 격자 — y 격자와 **같은 규격**이라 그림을 안 덮는다(그림보다 아래 층이기도 하다). */}
            <line x1={scales.x(0)} x2={scales.x(0)} y1={box.top} y2={box.top + box.height}
                stroke="var(--border-subtle)" strokeWidth={0.5} clipPath={`url(#${clipId})`} />
            </g>
            <g data-layer="axis-origin" clipPath={`url(#${clipId})`}>
                {/* 가로 0선 — 원점의 **값**(일봉 = 전일 종가, 분봉 = 타점 시각의 등락률). 화살촉은
                    세로축과 함께 은퇴했다: 오른쪽 끝이 이제 y 눈금 자리라 화살촉이 숫자를 찌른다. */}
                <line x1={box.left} x2={box.left + box.width} y1={scales.y(0)} y2={scales.y(0)} stroke={AXIS_LINE} strokeWidth={1} />
            </g>
        </>
    );
}

const axisText: CSSProperties = { fontSize: 10, fill: "var(--text-tertiary)" };
/** 눈금 아랫줄의 절대값 — 상대값(주)보다 한 단계 작고 흐리다. 둘이 같은 무게면 어느 쪽이 축인지 안 잡힌다. */
const axisAbsText: CSSProperties = { fontSize: 8.5, fill: "var(--text-quaternary, var(--text-tertiary))", opacity: 0.75, fontVariantNumeric: "tabular-nums" };
