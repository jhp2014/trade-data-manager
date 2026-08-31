// 격자 번들 조회 — GET /point-grids. 튜플(위치=계약)을 core 코덱 **한 벌**로 되살린다(서버 인코더와 같은 파일).
// Point 판정·특징 파생은 전부 클라 읽기 시점(lib/usePointGrids·pointsOf) — 계약의 뜻은 wire pointGrid.ts 머리.
import type { PointGrid, PointGridBundle } from "@trade-data-manager/wire";
import { decodeChartGrid } from "@trade-data-manager/market/domain";
import { apiGet } from "./http.js";

export type { PointGrid, PointGridBundle } from "@trade-data-manager/wire";

/** 되살린 번들 — 날짜 → (종목 → 격자). 튜플은 여기서 소멸하고 화면은 PointGrid 만 본다. */
export interface DecodedPointGrids {
    version: number;
    byDate: Map<string, Map<string, PointGrid>>;
}

export async function fetchPointGrids(signal?: AbortSignal): Promise<DecodedPointGrids> {
    const bundle = await apiGet<PointGridBundle>("point-grids", undefined, signal);
    const byDate = new Map<string, Map<string, PointGrid>>();
    for (const d of bundle.dates) {
        const byCode = new Map<string, PointGrid>();
        for (const w of d.charts) {
            const { stockCode, grid } = decodeChartGrid(w);
            byCode.set(stockCode, grid);
        }
        byDate.set(d.date, byCode);
    }
    return { version: bundle.version, byDate };
}
