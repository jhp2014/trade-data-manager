// 진입 후 경로 통계(순수) — 필터 집합의 경로들을 horizon 으로 자르고 분위 리본·MFE/MAE 를 계산한다.
//  · horizon = 진입 후 분(Infinity = 당일 종가까지). 각 경로를 t≤horizon 으로 crop.
//  · MFE = crop 구간 고가% 최댓값, MAE = 저가% 최솟값, terminal = crop 끝 종가%.
//  · 리본 = 1분 격자에 각 경로 종가를 forward-fill 후 스텝별 분위. **우측 절단**: 경로가 끝난 뒤엔
//    그 표본이 빠진다(t 별 n 이 줄어 표기). 늦은 진입이 짧은 걸 앞구간 왜곡 없이 반영.
import type { RankPointPath } from "../../api/rankPaths.js";

export interface Excursion {
    key: string;
    mae: number;
    mfe: number;
    terminal: number;
    up: boolean;
}

export interface PathSeries {
    key: string;
    up: boolean;
    pts: Array<{ t: number; v: number }>; // 종가% 스파게티(원바 기준, forward-fill 아님)
}

export interface Ribbon {
    t: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    n: number[]; // 스텝별 기여 표본 수(우측 절단으로 감소)
}

export interface PathStats {
    series: PathSeries[];
    excursions: Excursion[];
    ribbon: Ribbon;
    medianMfe: number | null;
    medianMae: number | null;
    maxT: number;
}

const pk = (p: { stockCode: string; date: string; time: string }): string => `${p.stockCode}|${p.date}|${p.time}`;

function quant(arr: number[], q: number): number {
    const a = arr.slice().sort((x, y) => x - y);
    const idx = (a.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

export function computePathStats(paths: RankPointPath[], horizon: number): PathStats {
    const cropped = paths
        .map((p) => ({ key: pk(p), bars: p.bars.filter((b) => b.t <= horizon) }))
        .filter((p) => p.bars.length > 0);

    const excursions: Excursion[] = cropped.map((p) => {
        let mae = Infinity;
        let mfe = -Infinity;
        for (const b of p.bars) {
            if (b.low < mae) mae = b.low;
            if (b.high > mfe) mfe = b.high;
        }
        const terminal = p.bars[p.bars.length - 1].close;
        return { key: p.key, mae, mfe, terminal, up: terminal >= 0 };
    });

    const series: PathSeries[] = cropped.map((p) => ({
        key: p.key,
        up: p.bars[p.bars.length - 1].close >= 0,
        pts: p.bars.map((b) => ({ t: b.t, v: b.close })),
    }));

    const gridMax = cropped.reduce((m, p) => Math.max(m, p.bars[p.bars.length - 1].t), 0);
    const cols: number[][] = Array.from({ length: gridMax + 1 }, () => []);
    for (const p of cropped) {
        const map = new Map<number, number>();
        for (const b of p.bars) map.set(b.t, b.close);
        const lastT = p.bars[p.bars.length - 1].t;
        let carry = 0;
        for (let g = 0; g <= gridMax; g++) {
            const hit = map.get(g);
            if (hit !== undefined) carry = hit;
            if (g <= lastT) cols[g].push(carry);
        }
    }
    const ribbon: Ribbon = { t: [], p25: [], p50: [], p75: [], n: [] };
    for (let g = 0; g <= gridMax; g++) {
        const col = cols[g];
        if (col.length === 0) continue;
        ribbon.t.push(g);
        ribbon.p25.push(quant(col, 0.25));
        ribbon.p50.push(quant(col, 0.5));
        ribbon.p75.push(quant(col, 0.75));
        ribbon.n.push(col.length);
    }

    return {
        series,
        excursions,
        ribbon,
        medianMfe: excursions.length ? quant(excursions.map((e) => e.mfe), 0.5) : null,
        medianMae: excursions.length ? quant(excursions.map((e) => e.mae), 0.5) : null,
        maxT: gridMax,
    };
}
