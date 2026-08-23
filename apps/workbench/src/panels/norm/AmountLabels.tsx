// 거래대금 **값 라벨** — "여기서 얼마가 터졌나"를 숫자로. 굵기가 못 하는 일(정확한 값)을 맡는다.
//
// 전 선(앵커 + 테마)이 **하나의 격자에서 겨룬다**(사용자 확정). 한 칸에 제일 큰 하나만 남으므로
// 화면엔 "지금 보이는 범위에서 제일 크게 터진 사건들"이 남고, 확대하면 작은 것들이 하나씩 드러난다.
// 축소하면 결국 0이 된다 — 그 상태의 "어디가 터졌나"는 굵기가 답한다.
//
// 후보는 구간에 든 런만(≥ 최하 경계) — 조용한 분까지 넣으면 격자가 뜻 없는 숫자로 찬다.
//
// ⚠ 순서 규약이 **없다**(캔들 층과 갈리는 지점). 라벨은 그림 위에 얹히는 층이라 어디서 그려도 뜻이
// 안 바뀐다 — 그래서 이 층이 두 번째 표본으로 쌌다.
import { useMemo } from "react";
import { fmtEok } from "../../lib/format.js";
import { ACTIVE } from "../../styles/palette.js";
import { pickAmountLabels, segmentIndexOf } from "./overlay.js";
import { spreadByY, type AmountRun } from "../canvas/amountRuns.js";
import { AMOUNT_LABEL_CELL } from "./amountLayer.js";

/** 자리를 잡은 라벨 하나 — `y` 는 실제 점, `labelY` 는 세로로 벌린 뒤의 글자 자리. */
export interface AmountLabel {
    code: string;
    own: boolean;
    x: number;
    y: number;
    labelY: number;
    value: number;
}

/** 라벨 후보를 낼 선 한 벌 — 앵커든 테마든 모양이 같다(런 + 벽시계 원점 + 주인 여부). */
export interface AmountSource {
    code: string;
    runs: readonly AmountRun[];
    /** 뷰 x → 벽시계 분 환산의 원점. 세그먼트(피벗 사이 구간) 판정에 쓴다. */
    baseT: number;
    own: boolean;
}

interface Scales { x: (v: number) => number; y: (v: number) => number }

/**
 * 라벨 자리 계산. 솎기는 **종목 안에서만** → 남은 것들이 세로로 겹치면 탈락이 아니라 **이동**이다
 * (지시선이 원래 자리를 가리킨다 — 숫자가 조용히 사라지지 않게).
 */
export function useAmountLabels(
    sources: readonly AmountSource[],
    scales: Scales | null,
    /** 앵커 골격의 피벗 시각(벽시계 분) — 세그먼트 경계. */
    pivotMinutes: readonly number[],
    on: boolean,
): AmountLabel[] {
    return useMemo(() => {
        if (!scales || !on) return [];
        type Cand = { group: string; seg: number; x: number; y: number; value: number; code: string; own: boolean };
        const cands: Cand[] = [];
        for (const s of sources) {
            for (const r of s.runs) {
                if (r.level <= 0) continue;
                // 라벨은 **터진 그 분**에 붙인다(런 중점이 아니라) — 중점은 사건이 난 자리가 아니다.
                cands.push({
                    group: s.code, seg: segmentIndexOf(pivotMinutes, r.maxAt.x + s.baseT),
                    x: scales.x(r.maxAt.x), y: scales.y(r.maxAt.y), value: r.maxAmount, code: s.code, own: s.own,
                });
            }
        }
        return spreadByY(pickAmountLabels(cands, AMOUNT_LABEL_CELL.w), AMOUNT_LABEL_CELL.w, AMOUNT_LABEL_CELL.gap);
    }, [sources, scales, pivotMinutes, on]);
}

/**
 * 그리기 — 점은 **터진 그 분의 자리**에 정확히 얹히고, 숫자는 그 오른쪽에 선다.
 * 점 색이 어느 선 것인지 말한다(좌측 이름 라벨의 점과 같은 색).
 */
export function AmountLabels({ labels, colorOf, dimmedExcept }: {
    labels: readonly AmountLabel[];
    colorOf: (code: string) => string;
    /** 테마 선 하나를 짚는 중이면 그 무리 밖은 물러난다. null 이면 전부 또렷하게. */
    dimmedExcept: ReadonlySet<string> | null;
}): JSX.Element {
    return (
        <>
            {labels.map((a) => {
                const c = a.own ? ACTIVE : colorOf(a.code);
                const moved = Math.abs(a.labelY - a.y) > 1.5;
                return (
                    <g key={`al-${a.code}-${a.x}-${a.y}`} style={{ pointerEvents: "none" }}
                        opacity={dimmedExcept && !a.own && !dimmedExcept.has(a.code) ? 0.25 : 1}>
                        {/* 자리를 옮긴 라벨은 **지시선**이 원래 자리를 가리킨다 — 안 그으면 그 숫자가
                            어느 선 것인지 알 수 없다(점 색만으론 비슷한 색끼리 헷갈린다). */}
                        {moved && <line x1={a.x} y1={a.y} x2={a.x + 4} y2={a.labelY} stroke={c} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.7} />}
                        <circle cx={a.x} cy={a.y} r={2.2} fill={c} />
                        <text x={a.x + 6} y={a.labelY + 3} textAnchor="start"
                            stroke="var(--bg-primary)" strokeWidth={3.5} paintOrder="stroke"
                            style={{ fontSize: 9.5, fill: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtEok(a.value)}
                        </text>
                    </g>
                );
            })}
        </>
    );
}
