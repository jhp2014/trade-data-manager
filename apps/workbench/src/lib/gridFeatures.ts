// 격자 특징 — 자동 Point 의 클라 파생 값을 **서버 계산 축과 같은 피드 모양**(ComputedAxisFeed)으로 낸다.
// 그 뒤는 전부 기존 경로다: computedAxisView 가 줄·값·fmt 를 만들고 레일·시트 열·axisValue 술어·밴드가
// 축 종류를 구분하지 않는다(decisions.md "클라 파생 특징은 축 문법에 앉힌다 — 새 술어 종류를 만들지 않는다").
//
// 키는 `grid-` 접두로 예약한다 — 서버 축 레지스트리(core axis/registry)가 이 접두를 쓰지 않는 것이 계약
// (겹치면 저장된 열 설정·필터가 엉뚱한 축을 가리킨다). 값은 **병합(축약) 후 구조에서 계산**된다 —
// 입력이 pointsOf 의 산출물(levelIdx·levelMin이 병합 반영)이라 원칙이 구조적으로 지켜진다.
//
// ⚠ 축 규칙 2(타점 시각까지만)는 클라 파생에도 그대로다 — 여기 특징은 전부 Point 시각 이전 정보만 본다.
//   "상승폭(P→마디)" 류(P 이후)는 조건 축이 아니라 outcome 트랙(2026-08-31 사용자 확정).
import type { ComputedAxisFeed, ComputedAxisPoint } from "@trade-data-manager/wire";
import type { PointGrid } from "@trade-data-manager/market/domain";
import type { AutoPointsView } from "./usePointGrids.js";

const r2 = (x: number): number => Math.round(x * 100) / 100;

/** Point 가 넘은 레벨(마디)에서 Point 캔들까지의 최저 저점 피벗 — 없으면 null(breakout 등, 결손은 결손).
 *  저점의 confirmedMin 은 안 본다(재정식화 격자에선 항상 null) — 가격 자체는 Point 시각 이전에 일어난
 *  사실이라 미래 누출이 아니고, 묻는 것이 "그 구간을 지나며 실제로 어디까지 빠졌나"이기 때문.
 *  저점 = 구간 **봉 최저**(피벗 최저가 아님)라 옛 격자보다 값이 조금 깊어질 수 있다(더 정확한 쪽). */
function pullbackDepthPct(grid: PointGrid, levelMin: number | null, levelPrice: number, pointMin: number): number | null {
    if (levelMin === null) return null;
    let low = Infinity;
    for (const p of grid.pivots) {
        if (p.kind !== "low" || p.min <= levelMin || p.min > pointMin) continue;
        if (p.price < low) low = p.price;
    }
    if (!Number.isFinite(low) || levelPrice <= 0) return null;
    return r2(((levelPrice - low) / levelPrice) * 100);
}

/**
 * 자동 Point 전체 → 특징 피드 3개. 자리는 useRankAxesValue 가 서버 피드 뒤에 이어 붙인다.
 * 값 없는 Point 는 values 에 없다 = 그 축에 미배치(계산 축 계약 그대로).
 */
export function gridFeatureFeeds(view: AutoPointsView, gridOf: (code: string, date: string) => PointGrid | undefined): ComputedAxisFeed[] {
    const baselinePct: ComputedAxisPoint[] = [];
    const priorLevels: ComputedAxisPoint[] = [];
    const pullback: ComputedAxisPoint[] = [];
    for (const a of view.points) {
        const key = { stockCode: a.stockCode, date: a.date, time: a.time };
        const grid = gridOf(a.stockCode, a.date);
        if (!grid) continue;
        if (grid.base !== null && grid.base > 0) baselinePct.push({ ...key, value: r2(((a.point.high - grid.base) / grid.base) * 100) });
        priorLevels.push({ ...key, value: a.point.levelIdx });
        const depth = pullbackDepthPct(grid, a.point.levelMin, a.point.levelPrice, a.point.min);
        if (depth !== null) pullback.push({ ...key, value: depth });
    }
    return [
        {
            key: "grid-baseline-pct",
            name: "기준선 대비",
            strongerWhen: "higher",
            display: { suffix: "%", decimals: 1, signed: true },
            values: baselinePct,
        },
        {
            key: "grid-prior-levels",
            name: "직전 마디 수",
            strongerWhen: "higher",
            display: { suffix: "개", decimals: 0, signed: false },
            values: priorLevels,
        },
        {
            key: "grid-pullback-pct",
            name: "눌림 깊이",
            strongerWhen: "lower",
            display: { suffix: "%", decimals: 1, signed: false },
            values: pullback,
        },
    ];
}
