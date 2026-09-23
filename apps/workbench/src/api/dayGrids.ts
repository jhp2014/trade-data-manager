// 날짜 격자 조회 — GET /day-grids?date. 튜플을 core 코덱 한 벌로 되살린다(/point-grids 와 같은 디코더).
// 계약의 뜻은 wire dayGrid.ts 머리 — 기준선 없는 순수 지형(zigzag 1%·floor 0·밴드 3%), 접기·판정은 클라.
import type { DayGridBundle, PointGrid } from "@trade-data-manager/wire";
import { DAY_GRID_DETECT_OPTIONS, decodeChartGrid, POINT_GRID_RULE_VERSION } from "@trade-data-manager/market/domain";
import { apiGet } from "./http.js";

export interface DecodedDayGrids {
    date: string;
    /** 종목 → 1% 격자(접기 전). 없는 종목 = 그날 분봉 없음. */
    byCode: ReadonlyMap<string, PointGrid>;
}

export async function fetchDayGrids(date: string, signal?: AbortSignal): Promise<DecodedDayGrids> {
    const b = await apiGet<DayGridBundle>("day-grids", { date }, signal);
    // 규칙 버전·굽기 옵션 가드 — 둘 중 하나라도 다르면 접기의 전제(1% · floor 0 → 갱신 봉 전부 수록)가
    // 조용히 깨진다. /point-grids 와 같은 이유로 throw(침묵 오독 금지).
    const o = b.opts;
    if (b.version !== POINT_GRID_RULE_VERSION) {
        throw new Error(`day-grids 규칙 버전 불일치: 서버 ${b.version} ≠ 클라 ${POINT_GRID_RULE_VERSION} — 서버 재기동·하드 리로드 필요`);
    }
    if (o.zigzagPct !== DAY_GRID_DETECT_OPTIONS.zigzagPct || o.floorEok !== DAY_GRID_DETECT_OPTIONS.floorEok || o.approachPct !== DAY_GRID_DETECT_OPTIONS.approachPct) {
        throw new Error(`day-grids 굽기 옵션 불일치: 서버 ${JSON.stringify(o)} ≠ 클라 ${JSON.stringify(DAY_GRID_DETECT_OPTIONS)}`);
    }
    const byCode = new Map<string, PointGrid>();
    for (const w of b.charts) {
        const { stockCode, grid } = decodeChartGrid(w);
        byCode.set(stockCode, grid);
    }
    return { date: b.date, byCode };
}
