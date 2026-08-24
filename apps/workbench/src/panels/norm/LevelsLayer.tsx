// 얹는 선(기준선·D선·전일 종가선) 층 — 정규화 선과 **같은 pct 환산**으로 가격 수준선을 얹는다.
//
// **주인이 스타일을 정한다**(사용자 확정): 색은 그 선과 똑같이(visualOf 결과를 owner 로 받는다) —
// 그룹 목록을 훑을 때 선은 무리 색인데 가로선만 앰버로 뜨면 "이게 어느 항목의 선이냐"를 다시
// 찾아야 했다(사용자 지적). 선이 이미 색으로 정해져 있으니 가로선은 그 색을 따라가면 그만이다.
//
// ## 라벨은 **왼쪽에 모인다**(y 축이 오른쪽으로 간 뒤)
// 이름 거터(GutterLayer)와 y 눈금이 둘 다 오른쪽이라, 수준선 라벨까지 오른쪽에 두면 셋이 겹친다.
// 둘이 동시에 떠도(단일 선택 + 호버) 위아래로 갈린다: 선택 = 선 위, 호버 = 선 아래.
// **기준선·후보는 실선** — 점선은 가격 수준선을 읽기 어렵게만 했다(사용자 확정).
// 기준선 여부는 선 모양이 아니라 라벨의 "기준" 접두어 — 어차피 최저가 규칙이라 아래가 기준선.
// **전일 종가선(0%)만 점선**이다 — 가격이 아니라 기준(시장이 준 원점)이라 종류가 다르다.
import { pct, type NormLine } from "./overlay.js";
import { fmtPct } from "../../lib/format.js";

/**
 * 수준선 하나 — 가격(원)과 종류. 기준선 후보는 앵커 복제본을 번들 캔들로 해소한 것,
 * `zero` 는 그 시장의 전일 종가(분봉 %p 공간에서 사라진 "진짜 0%")다.
 */
export interface NormLevel {
    price: number;
    baseline: boolean;
    /** 전일 종가선이면 그 시장 — 라벨이 `0% (KRX)` 로 서고 점선으로 그려진다. */
    zero?: "krx" | "un";
}

/** 수준선을 받을 선 하나 — 색·라벨 방향은 부모(선택·호버 규칙의 주인)가 정해 내려보낸다. */
export interface LevelOwner {
    s: NormLine;
    color: string;
    /** 라벨을 선 **위**에 붙이나 — 선택 = 위, 호버 = 아래(동시에 떠도 안 겹치게). */
    above: boolean;
}

/**
 * 전일 종가선이 창 밖일 때 라벨을 붙이는 가장자리 여백(px).
 *
 * ## 왜 전일 종가선만 당기나
 * 분봉 창은 타점 기준 ±20%p 인데 급등 타점일수록 전일 종가는 그보다 **아래**다(+26% 타점이면 26%p 아래).
 * 즉 이 선은 **구조적으로 창 밖인 게 정상**이라, 그대로 두면 토글을 켜도 화면이 그대로여서 "안 되는
 * 기능"처럼 보인다. 그래서 선 대신 **가장자리 라벨 + ▼/▲ 와 거리**로 존재를 말한다(판독 칩의 그 문법).
 * 기준선(앵커)은 대개 창 안이라 이 예외를 안 준다 — 규칙을 넓히면 가장자리가 라벨로 찬다.
 */
const EDGE_PAD = 8;

export function LevelsLayer({ owners, levelsOf, scaleY, box }: {
    owners: readonly LevelOwner[];
    /** 차트키 → 그 차트의 수준선들. 선은 차트 소유라 타점 단위 선도 chartKey 로 찾는다. */
    levelsOf: (chartKey: string) => readonly NormLevel[];
    scaleY: (v: number) => number;
    box: { left: number; top: number; width: number; height: number };
}): JSX.Element {
    return (
        <g data-layer="levels">
            {owners.map(({ s, color, above }) => (
                <g key={`lvl-${s.key}`} style={{ pointerEvents: "none" }}>
                    {levelsOf(s.chartKey).map((lv, i) => {
                        // 가격 → y 는 언제나 pct(price, basePrice) − baseRate — 선과 같은 환산이어야 한 공간이다.
                        const yPct = pct(lv.price, s.basePrice) - s.baseRate;
                        const y = scaleY(yPct);
                        // 전일 종가선이 창 밖이면 라벨만 가장자리로 당긴다(선은 클립돼 안 보인다).
                        const lo = box.top + EDGE_PAD;
                        const hi = box.top + box.height - EDGE_PAD;
                        const off = lv.zero === undefined ? "" : y < lo ? "▲" : y > hi ? "▼" : "";
                        const labelY = off === "" ? y : Math.min(hi, Math.max(lo, y));
                        return (
                            <g key={i}>
                                {/* 기준선은 **두껍게**(2.6px) — 1.4px 였을 땐 같은 굵기의 x축(0선)과 헷갈렸다(사용자 지적).
                                    축은 중성색 1px, 기준선은 선 색 2.6px 라 색과 굵기 둘 다로 갈린다.
                                    전일 종가선은 점선 1.4px — 가격 수준선(실선)과 종류가 다르다는 걸 모양이 진다. */}
                                <line x1={box.left} x2={box.left + box.width} y1={y} y2={y}
                                    stroke={color} strokeWidth={lv.zero ? 1.4 : lv.baseline ? 2.6 : 1.2}
                                    strokeDasharray={lv.zero ? "5 3" : undefined}
                                    opacity={lv.zero ? 0.85 : lv.baseline ? 0.95 : 0.8} />
                                <text x={box.left + 4} y={labelY + (above ? -4 : 10)} textAnchor="start"
                                    stroke="var(--bg-primary)" strokeWidth={3} paintOrder="stroke"
                                    style={{ fontSize: 9, fill: color, fontVariantNumeric: "tabular-nums" }}>
                                    {lv.zero
                                        // 전일 종가선은 **그 자리가 곧 0%** 라 상대값(yPct)이 아니라 0% 를 적는다 —
                                        // 화면 좌표(−baseRate)를 적으면 "0% 선인데 −26% 라 적힌" 꼴이 된다.
                                        // 창 밖이면 얼마나 떨어져 있는지를 %p 로 덧붙인다(그게 곧 타점의 등락률).
                                        ? `0% (${lv.zero.toUpperCase()})${off === "" ? "" : ` ${off}${Math.abs(yPct).toFixed(1)}%p`}`
                                        : `${lv.baseline ? "기준 " : ""}${fmtPct(yPct)}${s.baseRate !== 0 ? ` (${fmtPct(yPct + s.baseRate)})` : ""}`}
                                </text>
                            </g>
                        );
                    })}
                </g>
            ))}
        </g>
    );
}
