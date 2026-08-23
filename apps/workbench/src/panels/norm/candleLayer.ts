// 캔들의 **표시목록 빌더** — 무엇을 어디에 그리나만 정한다(그리는 건 페인터의 몫).
// 항목 캔들(기본 렌더)과 테마 멤버 캔들(배경)이 같은 빌더를 지난다 — 진하기만 다르다.
//
// ⚠ **그리는 순서가 규약이다**: 이 층은 클립 그룹 안에서 **맨 아래**(테마 선보다도 아래)에 와야 한다.
// 선·라벨이 그 위를 지나야 읽힌다. 나중에 그린 게 위이므로 목록에서 자리를 옮기면 그 뜻이 조용히
// 뒤집힌다 — 층 순서 테스트가 그걸 잡는다.
import { amountBucketIndex, AMOUNT_BUCKETS_EOK } from "@trade-data-manager/market/domain";
import { AMOUNT_BUCKET_COLORS, highMarkerColor } from "../../chart/chartUtils.js";
import { candleWidth, type ViewCandle } from "./candles.js";
import { compact, type DrawGroup, type DrawLayer } from "../canvas/drawList.js";

/** 캔들 색 — 국내 관례(상승 적/하락 청). 낮은 알파로 깔리므로 진한 원색을 쓴다(흐려도 방향이 남게). */
const CANDLE_UP = "#d32f2f";
const CANDLE_DOWN = "#1976d2";

interface Box { left: number; top: number; width: number; height: number }
interface Scales { x: (v: number) => number; y: (v: number) => number }

/** 그릴 캔들 한 벌 — 항목 하나(또는 테마 멤버 하나). 진하기는 패널이 역할(시선·흐림·멤버)로 정해 내려보낸다. */
export interface CandleSeries {
    key: string;
    candles: readonly ViewCandle[];
    opacity: number;
    /** 봉 위 마커(일봉=고가 등락률 / 분봉=거래대금 구간)를 찍나 — 여럿이 겹치면 숫자가 뒤엉켜 **시선 항목만** 찍는다. */
    markers: boolean;
}

export interface CandleLayerParams {
    sets: readonly CandleSeries[];
    /** 일봉인가 — 마커 정책이 갈린다(고가 등락률 vs 거래대금 구간 — 둘 다 차트 패널의 그 규칙 그대로). */
    daily: boolean;
    scales: Scales;
    box: Box;
}

export function candleLayer({ sets, daily, scales, box }: CandleLayerParams): DrawLayer {
    // 폭이 좁아져도 접지 않는다(사용자 확정) — candleWidth 가 하한을 지킨다.
    const w = candleWidth(Math.abs(scales.x(1) - scales.x(0)));
    const inView = (k: ViewCandle): boolean => {
        const cx = scales.x(k.x);
        return cx >= box.left - w && cx <= box.left + box.width + w;
    };

    const groups: DrawGroup[] = [];
    for (const set of sets) {
        for (const k of set.candles) {
            if (!inView(k)) continue;
            const cx = scales.x(k.x);
            const color = k.c >= k.o ? CANDLE_UP : CANDLE_DOWN;
            const yTop = scales.y(Math.max(k.o, k.c));
            const yBot = scales.y(Math.min(k.o, k.c));
            groups.push({
                opacity: set.opacity,
                ops: [
                    // 꼬리 — 고가~저가. **몸통을 비껴 두 토막**으로(캔버스는 op 마다 알파라 겹친 자리가 진해진다).
                    { op: "line", x1: cx, y1: scales.y(k.h), x2: cx, y2: yTop, stroke: color, width: 1 },
                    { op: "line", x1: cx, y1: yBot, x2: cx, y2: scales.y(k.l), stroke: color, width: 1 },
                    // 몸통 — 시가~종가. 도지(0폭)는 최소 1px 로 세워 사라지지 않게.
                    { op: "rect", x: cx - w / 2, y: yTop, w, h: Math.max(1, yBot - yTop), fill: color },
                ],
            });

            if (!set.markers) continue;
            // 봉 위 마커 — 해상도마다 관심사가 다르다(차트 패널의 그 규칙 그대로):
            //  · 일봉 = 고가 등락률(전일 종가 대비 %, 임계 이상만 · highMarkerColor)
            //  · 분봉 = 거래대금 구간(8구간 색 + 구간 하한)
            const mk = daily
                ? (() => {
                    const c2 = k.highPct === undefined ? null : highMarkerColor(k.highPct);
                    return c2 === null ? null : { color: c2, text: k.highPct!.toFixed(1) };
                })()
                : (() => {
                    const b = amountBucketIndex(k.amount);
                    return b < 0 ? null : { color: AMOUNT_BUCKET_COLORS[b], text: String(AMOUNT_BUCKETS_EOK[b]) };
                })();
            // 마커는 캔들보다 진하다(묶음에 알파를 안 건다) — 캔들은 그림이지만 이건 사건이다.
            if (mk) {
                groups.push({
                    ops: [
                        { op: "circle", cx, cy: scales.y(k.h) - 5, r: 2.6, fill: mk.color },
                        {
                            op: "text", x: cx, y: scales.y(k.h) - 11, text: mk.text, anchor: "middle",
                            fill: mk.color, size: 8.5, weight: 700,
                            halo: { color: "var(--bg-primary)", width: 2.5 },
                        },
                    ],
                });
            }
        }
    }
    return { name: "candles", groups: compact(groups) };
}
