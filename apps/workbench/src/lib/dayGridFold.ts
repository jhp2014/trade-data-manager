// 날짜 격자 접기 메모 — (1% 격자, p%) → 접은 격자. 접기는 차트당 수십 µs(recon:day-fold 실측)지만
// 셀 평가가 조건 편집마다 다시 돌므로 같은 참조를 돌려줘 하류 메모가 맞게 한다. 격자 참조가 곧 세대라
// WeakMap 이면 날짜 번들이 버려질 때 같이 사라진다.
import { foldGrid, type PointGrid } from "@trade-data-manager/market/domain";

const FOLDED = new WeakMap<PointGrid, Map<number, PointGrid>>();

export function foldedGridOf(grid: PointGrid, pct: number): PointGrid {
    let per = FOLDED.get(grid);
    if (!per) FOLDED.set(grid, (per = new Map()));
    const hit = per.get(pct);
    if (hit) return hit;
    const made = foldGrid(grid, pct).grid;
    per.set(pct, made);
    return made;
}
