// 캔들 오버레이의 **그리기만** — 상태·재료는 useCandles 가 안다. 순수 그림이라 포인터를 안 받는다.
//
// ⚠ **그리는 순서가 규약이다**: 이 층은 클립 그룹 안에서 **맨 아래**(테마 선보다도 아래)에 와야 한다.
// 골격이 그 위를 지나야 "축약이 원본의 어디를 밟았나"가 읽힌다. SVG 는 나중에 그린 게 위이므로
// 부르는 자리를 옮기면 그 뜻이 조용히 뒤집힌다 — 컴포넌트로 떨어져 나온 지금은 이 주석이 그 계약이다.
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { AMOUNT_BUCKET_COLORS, highMarkerColor } from "../../chart/chartUtils.js";
import { candleWidth, type ViewCandle } from "./candles.js";
import type { CandleSet } from "./useCandles.js";

/** 캔들 색 — 국내 관례(상승 적/하락 청). 낮은 알파로 깔리므로 진한 원색을 쓴다(흐려도 방향이 남게). */
const CANDLE_UP = "#d32f2f";
const CANDLE_DOWN = "#1976d2";

interface Box { left: number; top: number; width: number; height: number }
interface Scales { x: (v: number) => number; y: (v: number) => number }

export function CandleLayer({ set, scales, box, anchorShown, memberShown, opacityOf }: {
    set: CandleSet;
    scales: Scales;
    box: Box;
    anchorShown: boolean;
    memberShown: (code: string) => boolean;
    opacityOf: (member: boolean) => number;
}): JSX.Element {
    // 폭이 좁아져도 접지 않는다(사용자 확정) — candleWidth 가 하한을 지킨다.
    const w = candleWidth(Math.abs(scales.x(1) - scales.x(0)));
    const inView = (k: ViewCandle): boolean => {
        const cx = scales.x(k.x);
        return cx >= box.left - w && cx <= box.left + box.width + w;
    };

    const draw = (ks: readonly ViewCandle[], opacity: number, keyPrefix: string): JSX.Element => (
        <g style={{ pointerEvents: "none" }}>
            {ks.filter(inView).map((k) => {
                const cx = scales.x(k.x);
                const color = k.c >= k.o ? CANDLE_UP : CANDLE_DOWN;
                const yTop = scales.y(Math.max(k.o, k.c));
                const yBot = scales.y(Math.min(k.o, k.c));
                // 봉 위 마커 — **해상도마다 관심사가 다르다**(둘 다 차트 패널의 그 규칙 그대로):
                //  · 분봉 = 거래대금 구간(8구간 색 + 구간 하한). 그 화면의 관심사가 분당 대금이다.
                //  · 일봉 = **고가 등락률**(전일 종가 대비 %, 임계 10% 이상만 · highMarkerColor).
                //    일봉에 거래대금 구간을 쓰면 그건 분봉 정책이라 전 캔들이 최상위로 찍혀 안 갈린다.
                const mk = set.daily
                    ? (() => {
                        const c2 = k.highPct === undefined ? null : highMarkerColor(k.highPct);
                        return c2 === null ? null : { color: c2, text: k.highPct!.toFixed(1) };
                    })()
                    : (() => {
                        const b = amountBucketIndex(k.amount);
                        return b < 0 ? null : { color: AMOUNT_BUCKET_COLORS[b], text: String(AMOUNT_BUCKETS_EOK[b]) };
                    })();
                return (
                    <g key={`${keyPrefix}${k.x}`}>
                        <g opacity={opacity}>
                            {/* 꼬리 — 고가~저가. 이게 골격 피벗(high/low)이 앉는 자리다. */}
                            <line x1={cx} x2={cx} y1={scales.y(k.h)} y2={scales.y(k.l)} stroke={color} strokeWidth={1} />
                            {/* 몸통 — 시가~종가. 도지(0폭)는 최소 1px 로 세워 사라지지 않게. */}
                            <rect x={cx - w / 2} y={yTop} width={w} height={Math.max(1, yBot - yTop)} fill={color} />
                        </g>
                        {/* 마커는 캔들보다 진하다 — 캔들은 배경이지만 이건 사건이다.
                            점 + 숫자 = 차트 패널의 aboveBar 마커와 같은 모양(색도 같은 함수). */}
                        {mk && (
                            <g>
                                <circle cx={cx} cy={scales.y(k.h) - 5} r={2.6} fill={mk.color} />
                                <text x={cx} y={scales.y(k.h) - 11} textAnchor="middle"
                                    stroke="var(--bg-primary)" strokeWidth={2.5} paintOrder="stroke"
                                    style={{ fontSize: 8.5, fill: mk.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                    {mk.text}
                                </text>
                            </g>
                        )}
                    </g>
                );
            })}
        </g>
    );

    return (
        <>
            {anchorShown && draw(set.anchor, opacityOf(false), "ca")}
            {/* 켜 둔 테마 멤버들 — 앵커보다 한 겹 뒤(배경의 배경). 짚은 게 자기면 남는다. */}
            {set.members.filter((m) => memberShown(m.code)).map((m) => (
                <g key={`cm-${m.code}`}>{draw(m.candles, opacityOf(true), `cm${m.code}-`)}</g>
            ))}
        </>
    );
}
