// 얹는 선(기준선·D선) 층 — 정규화 선과 **같은 pct 환산**으로 가격 수준선을 얹는다.
//
// **주인이 스타일을 정한다**(사용자 확정): 색은 그 선과 똑같이(visualOf 결과를 owner 로 받는다) —
// 그룹 목록을 훑을 때 골격선은 무리 색인데 가로선만 앰버로 뜨면 "이게 어느 항목의 선이냐"를 다시
// 찾아야 했다(사용자 지적). 선이 이미 색으로 정해져 있으니 가로선은 그 색을 따라가면 그만이다.
// 둘이 동시에 떠도(단일 선택 + 호버) 라벨 위치로 갈린다: 선택 = 오른쪽, 호버 = 왼쪽.
// **둘 다 실선** — 점선은 가격 수준선을 읽기 어렵게만 했다(사용자 확정).
// 기준선 여부는 선 모양이 아니라 라벨의 "기준" 접두어 — 어차피 최저가 규칙이라 아래가 기준선.
import { pct, type NormLine } from "./overlay.js";
import { fmtPct } from "../../lib/format.js";

/** 수준선을 받을 골격 하나 — 색·라벨 방향은 부모(선택·호버 규칙의 주인)가 정해 내려보낸다. */
/** 수준선 하나 - 가격(원)과 기준선 여부. 재료는 앵커 복제본을 번들 캔들로 해소한 것(useNormLines). */
export interface NormLevel {
    price: number;
    baseline: boolean;
}

export interface LevelOwner {
    s: NormLine;
    color: string;
    /** 라벨을 오른쪽 끝에 붙이나 — 선택 = 오른쪽, 호버 = 왼쪽(동시에 떠도 안 겹치게). */
    right: boolean;
}

export function LevelsLayer({ owners, levelsOf, scaleY, box }: {
    owners: readonly LevelOwner[];
    /** 차트키 → 그 차트의 수준선들. 선은 차트 소유라 타점 단위 선도 chartKey 로 찾는다. */
    levelsOf: (chartKey: string) => readonly NormLevel[];
    scaleY: (v: number) => number;
    box: { left: number; width: number };
}): JSX.Element {
    return (
        <g data-layer="levels">
            {owners.map(({ s, color, right }) => (
                <g key={`lvl-${s.key}`} style={{ pointerEvents: "none" }}>
                    {levelsOf(s.chartKey).map((lv, i) => {
                        // 가격 → y 는 언제나 pct(price, basePrice) − baseRate — 골격 피벗과 같은 환산이어야 한 공간이다.
                        const yPct = pct(lv.price, s.basePrice) - s.baseRate;
                        const y = scaleY(yPct);
                        return (
                            <g key={i}>
                                {/* 기준선은 **두껍게**(2.6px) — 1.4px 였을 땐 같은 굵기의 x축(0선)과 헷갈렸다(사용자 지적).
                                    축은 중성색 1px, 기준선은 선 색 2.6px 라 색과 굵기 둘 다로 갈린다. */}
                                <line x1={box.left} x2={box.left + box.width} y1={y} y2={y}
                                    stroke={color} strokeWidth={lv.baseline ? 2.6 : 1.2} opacity={lv.baseline ? 0.95 : 0.8} />
                                <text x={right ? box.left + box.width - 4 : box.left + 4} y={y - 4} textAnchor={right ? "end" : "start"}
                                    stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                    style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                    {lv.baseline ? "기준 " : ""}{fmtPct(yPct)}{s.baseRate !== 0 ? ` (${fmtPct(yPct + s.baseRate)})` : ""}
                                </text>
                            </g>
                        );
                    })}
                </g>
            ))}
        </g>
    );
}
