// core/market/domain/grid/invariants — 격자 구조 불변식 ①②④⑤⑥ 검사(순수, 격자만 본다).
// 명세 §2.7(.claude/specs/2026-09-05-grid-swings-v9.md). detectGrid.test 가 전 fixture 에, recon 이
// 전 차트에 돌린다 — 두 벌이면 검사 규칙이 갈리므로 여기 한 곳이다.
// ③(확정 규칙 재진술)은 봉 배열이 필요해 여기 없다 — recon 의 naivePivots 브루트포스가 담당.
import type { PointGrid } from "./grid.js";
import { levelViewOf } from "./levelView.js";
import { amountFrom, legAmountOfPair } from "./windows.js";

/** 위반 목록(빈 배열 = 전부 성립). ⑤의 `>` 케이스(클래스 ① — 세션 최고가가 피벗이 못 됨)는 위반이
 *  아니라 관찰이라 `sessionHighAbovePivots` 로 따로 알린다(recon 이 클래스 분류와 대조). */
export interface GridInvariantReport {
    violations: string[];
    /** sessionHigh.price > max(고점 피벗 가격) — 클래스 ① 차트에서만 참이어야 한다. */
    sessionHighAbovePivots: boolean;
    /** 퇴화 쌍(폴백 저점 — levelView.ts 머리) 수 — 클래스 ① 차트에서만 나와야 한다(관찰). */
    degeneratePairs: number;
}

export function checkGridInvariants(grid: PointGrid): GridInvariantReport {
    const v: string[] = [];
    const ps = grid.pivots;
    // ① 시간 강한 오름차순 + kind 교대(첫 kind 는 자유), ② 확정 시각 > 극값 시각·미확정은 꼬리 1개만.
    for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if (i > 0 && p.min <= ps[i - 1].min) v.push(`① 시간 비단조: [${i}] min=${p.min}`);
        if (i > 0 && p.kind === ps[i - 1].kind) v.push(`① 교대 위반: [${i}] ${p.kind} 연속`);
        if (p.confirmedMin !== null && p.confirmedMin <= p.min) v.push(`② 확정 시각 역행: [${i}] min=${p.min}`);
        if (p.confirmedMin === null && i !== ps.length - 1) v.push(`② 미확정이 꼬리(마지막)가 아님: [${i}] min=${p.min}`);
    }
    // ④ cross ⟺ 레벨 ∧ 첫 레벨 아님, cross.min ∈ (직전 레벨.min, 이 레벨.min].
    let maxHigh = -Infinity;
    let levelCount = 0;
    let prevLevelMin = -1;
    for (const p of ps) {
        if (p.kind !== "high") {
            if (p.cross !== null) v.push(`④ 저점에 cross: min=${p.min}`);
            continue;
        }
        const isLevel = p.confirmedMin !== null && p.price > maxHigh;
        if (p.price > maxHigh) maxHigh = p.price;
        if (isLevel) {
            levelCount++;
            if (levelCount === 1) {
                if (p.cross !== null) v.push(`④ 첫 레벨에 cross: min=${p.min}`);
            } else if (p.cross === null) {
                v.push(`④ 레벨 cross 결손: min=${p.min}`);
            } else if (!(p.cross.min > prevLevelMin && p.cross.min <= p.min)) {
                v.push(`④ cross 위치 위반: 레벨 min=${p.min}, cross=${p.cross.min}, 직전 레벨=${prevLevelMin}`);
            }
            prevLevelMin = p.min;
        } else if (p.cross !== null) {
            v.push(`④ 비레벨 고점에 cross: min=${p.min}`);
        }
    }
    // ⑤ sessionHigh.price ≥ max(고점 피벗 가격, 꼬리 포함) — `>` 는 클래스 ① 관찰(위반 아님).
    const highPrices = ps.filter((p) => p.kind === "high").map((p) => p.price);
    const maxPivotHigh = highPrices.length > 0 ? Math.max(...highPrices) : null;
    let sessionHighAbovePivots = false;
    if (maxPivotHigh !== null) {
        if (grid.sessionHigh.price < maxPivotHigh) v.push(`⑤ sessionHigh(${grid.sessionHigh.price}) < 최대 고점 피벗(${maxPivotHigh})`);
        else if (grid.sessionHigh.price > maxPivotHigh) sessionHighAbovePivots = true;
    } else if (ps.length > 0) {
        sessionHighAbovePivots = true; // 저점 피벗만 있는 격자 — 세션 최고가는 정의상 피벗 밖
    }
    // ⑥ 레벨 쌍마다 저점 존재(levelViewOf 가 throw) + 파생 창 0 < renewal ≤ leg(레벨 쌍 위, §2.7 ④).
    // 퇴화 쌍(levelView.ts 머리 — 확정 봉 = 크로싱 봉이라 구간이 비어 폴백 저점을 쓴 쌍)은 "저점 봉 <
    // 다음 크로싱" 전제 밖이라 두 검사에서 제외하고 관찰로만 센다(클래스 ① 차트에서만 나와야 한다).
    let degeneratePairs = 0;
    try {
        const pairs = levelViewOf(grid);
        for (let k = 0; k < pairs.length; k++) {
            const pair = pairs[k];
            const degenerate = pair.low.min >= pair.endMin; // endMin = 구간 경계의 단일 출처(levelView.ts)
            if (degenerate) {
                degeneratePairs++;
                continue;
            }
            const prev = k > 0 ? pairs[k - 1] : null;
            const prevDegenerate = prev !== null && prev.low.min >= prev.endMin;
            if (prevDegenerate) continue; // 직전 쌍이 퇴화면 이 쌍의 leg 분모가 전제 밖 — 창 검사 제외
            const leg = BigInt(legAmountOfPair(pair, prev));
            if (leg <= 0n) v.push(`④ leg ≤ 0: 레벨 min=${pair.high.min}`);
            if (pair.high.cross !== null) {
                const renewal = BigInt(amountFrom(pair.high.cross, pair.high.cum));
                if (!(renewal > 0n && renewal <= leg)) v.push(`④ renewal 창 위반(0 < r ≤ leg): 레벨 min=${pair.high.min}`);
            }
        }
    } catch (err) {
        v.push(`⑥ ${err instanceof Error ? err.message : String(err)}`);
    }
    return { violations: v, sessionHighAbovePivots, degeneratePairs };
}
