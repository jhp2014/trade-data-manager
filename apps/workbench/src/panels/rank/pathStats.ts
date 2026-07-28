// 진입 후 경로 통계(순수) — 필터 집합의 경로를 horizon 으로 자르고 MFE·분할 MAE 를 뽑고, 목표/손절 첫터치를 시뮬.
//  · horizon = 진입 후 분(각 경로를 t≤horizon 으로 crop). MFE=고가% max, terminal=crop 끝 종가%.
//  · 분할 MAE(tPeak=MFE 시각 기준): maePre=[0,tPeak] 저가 최저(진입 손절) / maePost=[tPeak,h] 저가 최저(트레일링).
//  · 시뮬 = 각 경로를 분봉 고가/저가로 걸어 목표(+%)·손절(−%) 중 첫 터치. 같은 바 동시=손절(보수).
// 히트맵(시간×% 밀도)은 뷰 관심사라 패널에서 bars 로 직접 빈닝한다(여긴 스칼라 통계·시뮬만).
import { pointKey } from "../../lib/pointKey.js";
import type { RankPointPath } from "../../api/rankPaths.js";

export interface Excursion {
    key: string;
    mfe: number; // 최대상승 %(고가)
    tPeak: number; // MFE 시각(분)
    maePre: number; // 고점 전 최저 %(진입 손절)
    maePost: number; // 고점 후 최저 %(트레일링)
    terminal: number; // crop 끝 종가 %
    up: boolean;
}

export interface PathStats {
    excursions: Excursion[];
    maxT: number;
    medianMfe: number | null;
    medianMaePre: number | null;
    medianMaePost: number | null;
}

export interface SimResult {
    win: number; // 목표 먼저
    loss: number; // 손절 먼저
    none: number; // 미도달
    total: number;
    expR: number; // 기대값(R = target/|stop|)
}

function quant(arr: number[], q: number): number {
    const a = arr.slice().sort((x, y) => x - y);
    const idx = (a.length - 1) * q;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

interface Cropped { key: string; bars: RankPointPath["bars"]; }
// 진입 **이후**(t>0)만. 진입 바(t=0)의 저가/고가는 그 분봉 안 진입 시점 이전 값이라 MFE/MAE·시뮬을
// 왜곡 → 제외. 경로는 진입 전(음수 t) 궤적도 실어오지만 통계는 진입 다음 바부터 본다.
function crop(paths: RankPointPath[], horizon: number): Cropped[] {
    return paths.map((p) => ({ key: pointKey(p), bars: p.bars.filter((b) => b.t > 0 && b.t <= horizon) })).filter((p) => p.bars.length > 0);
}

export function computePathStats(paths: RankPointPath[], horizon: number): PathStats {
    const cropped = crop(paths, horizon);
    const excursions: Excursion[] = cropped.map((p) => {
        let mfe = -Infinity;
        let tPeak = p.bars[0].t;
        for (const b of p.bars) if (b.high > mfe) { mfe = b.high; tPeak = b.t; }
        let maePre = Infinity;
        let maePost = Infinity;
        for (const b of p.bars) {
            if (b.t <= tPeak && b.low < maePre) maePre = b.low;
            if (b.t >= tPeak && b.low < maePost) maePost = b.low;
        }
        const terminal = p.bars[p.bars.length - 1].close;
        return { key: p.key, mfe, tPeak, maePre, maePost, terminal, up: terminal >= 0 };
    });
    const med = (f: (e: Excursion) => number): number | null => (excursions.length ? quant(excursions.map(f), 0.5) : null);
    return {
        excursions,
        maxT: cropped.reduce((m, p) => Math.max(m, p.bars[p.bars.length - 1].t), 0),
        medianMfe: med((e) => e.mfe),
        medianMaePre: med((e) => e.maePre),
        medianMaePost: med((e) => e.maePost),
    };
}

/** 목표/손절 첫터치 시뮬 — target>0, stop<0(%). 같은 바에서 둘 다 닿으면 손절(보수 가정). */
export function simulateTargetStop(paths: RankPointPath[], horizon: number, target: number, stop: number): SimResult {
    const cropped = crop(paths, horizon);
    let win = 0;
    let loss = 0;
    let none = 0;
    for (const p of cropped) {
        let done = false;
        for (const b of p.bars) {
            if (b.low <= stop) { loss++; done = true; break; }
            if (b.high >= target) { win++; done = true; break; }
        }
        if (!done) none++;
    }
    const total = cropped.length;
    const rr = stop !== 0 ? target / Math.abs(stop) : 0;
    const expR = total ? (win / total) * rr - (loss / total) * 1 : 0;
    return { win, loss, none, total, expR };
}
