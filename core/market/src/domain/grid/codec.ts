// 격자 와이어 코덱 — PointGrid ↔ 튜플. **위치가 계약이다**(필드 표 = 아래 타입 주석 — 순서를 바꾸면
// 와이어가 조용히 깨지므로 여기 타입·인코더·디코더를 한 커밋으로만 움직인다).
//
// 튜플인 이유: 소형 객체 수십만 개(6,016차트 × 피벗 p50 19 + 신고가 p50 8)의 키 반복을 걷어
// 회선·파싱 비용을 절반 이하로. 대금(tv·tvMax2·legAmount)은 **string 유지** — BigInt 무손실 계약을
// 와이어에서 깨지 않는다. 서버 파일 캐시는 평문 객체 그대로(눈으로 까볼 수 있게) — 변환은 응답에서만.
//
// 인코더(apps/api)·디코더(workbench)가 이 한 벌을 같이 쓴다(rankSectionOf 공유 방식) — 두 벌로
// 갈리면 위치 계약이 어긋나는 날 그림이 조용히 뒤틀린다. 왕복 보존은 codec.test 가 못 박는다.
import type { GridNewHigh, GridPivot, PointGrid } from "./grid.js";

/** [kind(0=high, 1=low), min, price, confirmedMin(−1=미확정), legAmount] */
export type WirePivot = [number, number, number, number, string];
/** [min, high, tv, tvMax2, bull(1|0)] */
export type WireNewHigh = [number, number, string, string, number];
/** [stockCode, base(null=기준선 값 없음), touchMin(−1=미터치), pivots, newHighs] */
export type WireChartGrid = [string, number | null, number, WirePivot[], WireNewHigh[]];

export function encodeChartGrid(stockCode: string, g: PointGrid): WireChartGrid {
    return [
        stockCode,
        g.base,
        g.touchMin ?? -1,
        g.pivots.map((p): WirePivot => [p.kind === "high" ? 0 : 1, p.min, p.price, p.confirmedMin ?? -1, p.legAmount]),
        g.newHighs.map((e): WireNewHigh => [e.min, e.high, e.tv, e.tvMax2, e.bull ? 1 : 0]),
    ];
}

export function decodeChartGrid(w: WireChartGrid): { stockCode: string; grid: PointGrid } {
    return {
        stockCode: w[0],
        grid: {
            base: w[1],
            touchMin: w[2] < 0 ? null : w[2],
            pivots: w[3].map(
                (p): GridPivot => ({ kind: p[0] === 0 ? "high" : "low", min: p[1], price: p[2], confirmedMin: p[3] < 0 ? null : p[3], legAmount: p[4] }),
            ),
            newHighs: w[4].map((e): GridNewHigh => ({ min: e[0], high: e[1], tv: e[2], tvMax2: e[3], bull: e[4] === 1 })),
        },
    };
}
