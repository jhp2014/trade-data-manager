// 순위 밴드 AND 필터(순수) — 축별 상대순위 줄에서 밴드를 걸어 유사 상황(타점) 집합을 좁힌다.
//  · 밴드 = 슬롯 앵커 orderKey 구간 [from,to](양끝 포함). reindex·삽입에 안 흔들림(슬롯 자체 기준).
//  · 결합 = strict AND: 활성(밴드 걸린) 축 **전부에 배치돼 있고** 각 밴드 안이어야 통과.
//    미배치("그 축에서 어디 서는지 모름")는 매치 아님 → 탈락.
//  · coverage = 활성 축 전부에 배치된 타점 모수(밴드 무시). N≤coverage. 교집합 희소성 신뢰도 판단용.
import type { PlacedPoint } from "@trade-data-manager/wire";
import type { RankPoint } from "../../api/rank.js";

/** 한 축의 활성 밴드 — orderKey 구간(from≤to, 단일 슬롯이면 from===to). */
export interface AxisBand {
    axisId: string;
    from: number;
    to: number;
}

export interface FilterResult {
    points: RankPoint[];
    coverage: number;
}

const pk = (p: { stockCode: string; date: string; time: string }): string => `${p.stockCode}|${p.date}|${p.time}`;

export function filterPoints(linesByAxis: Map<string, PlacedPoint[]>, bands: AxisBand[]): FilterResult {
    if (bands.length === 0) return { points: [], coverage: 0 };
    const sets = bands.map((b) => {
        const placed = new Set<string>();
        const inBand = new Set<string>();
        const meta = new Map<string, RankPoint>();
        for (const pp of linesByAxis.get(b.axisId) ?? []) {
            const k = pk(pp);
            placed.add(k);
            if (!meta.has(k)) meta.set(k, { stockCode: pp.stockCode, date: pp.date, time: pp.time });
            if (pp.orderKey >= b.from && pp.orderKey <= b.to) inBand.add(k);
        }
        return { placed, inBand, meta };
    });
    const points: RankPoint[] = [];
    let coverage = 0;
    for (const [k, rp] of sets[0].meta) {
        if (!sets.every((s) => s.placed.has(k))) continue; // 활성축 전부에 배치(strict AND)
        coverage++;
        if (sets.every((s) => s.inBand.has(k))) points.push(rp);
    }
    return { points, coverage };
}
