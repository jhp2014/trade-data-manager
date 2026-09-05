// core/market/domain/grid/windows — 격자의 대금 창·다리 고점 파생(읽기 층, 순수). 규칙: decisions.md
// "대금은 창이 아니라 누적 스냅샷으로 굽는다" · "시그널 결과" 절.
//
// 격자는 기록 봉마다 세션 누적 대금(`cum`, 그 봉 포함)만 굽고, 창은 여기서 두 기록 봉의 차로 낸다:
//   포함 창 [a..b]      = b.cum − a.cum + a.tv   (a 는 창의 시작이 될 수 있는 봉 — GridBarMark·신고가 캔들)
//   시작 배타 창 (a..b] = b.cum − a.cum           (a 는 피벗 — 직전 피벗 "다음 봉부터")
// v8 legAmount(레벨 쌍 저점 기준)의 재현은 **`legAmountOfPair`** 다 — `legAmountOf`(피벗 색인 판)는 v9
// 경로 뷰에선 국소 극값·선행 저점이 끼면 v8 값과 다르다(직전 피벗 = 국소 저점일 수 있음). 불변식
// 0 < renewal ≤ leg 는 레벨 쌍 위(`legAmountOfPair`)의 성질로 남는다(invariants.ts·recon).
//
// 다리 고점(`legHighOf`) = 시그널 이후 첫 **레벨** 고점(마디 뷰). 없으면 꼬리(세션 끝까지 −2% 안 빠짐)
// = 결손. 다리 창의 시작(`legStartOf`) = 시그널이 넘은 레벨의 크로싱: 돌파(레벨 0)는 기준선 터치 봉,
// 재돌파는 **다음 레벨**의 `cross`(= 그 레벨 가격을 처음 넘은 봉). 병합(mergeRisePct)으로 다리 고점이
// 더 뒤로 가도 크로싱 기록은 같은 자리다(그 다음 레벨이 "L 의 크로싱"을 들고 있다).
// `DerivedPoint` 에 필드로 넣지 않는 이유: pointsOf 판정은 결과를 모른다(행 정체성·행 시각 계약) —
// 다리 고점은 소비처(차트 표식·결과 걷기 outcome.ts)가 필요할 때 격자를 더 보고 얻는 파생이다.
// 다리 고점 ≡ 결과 걷기의 T=2% 연장 고점 — **상단 돌파 Point 에 대해서만**(outcome.test 가 동치로 고정).
// 밴드 Point(approachPct>0)는 품는 레벨 쌍의 눌림이 먼저라 동치가 깨진다 — 걷기 결과를 쓸 것(§10.4).
import type { GridBarMark, GridPivot, PointGrid } from "./grid.js";
import { levelViewOf, type LevelPair } from "./levelView.js";
import type { DerivedPoint } from "./points.js";

/** 포함 창 [start .. 끝 봉] 의 누적 대금(원, string). endCum = 끝 봉의 cum(그 봉 포함). */
export function amountFrom(start: GridBarMark, endCum: string): string {
    return (BigInt(endCum) - BigInt(start.cum) + BigInt(start.tv)).toString();
}

/** 피벗 색인 leg — 직전 **피벗**(경로 뷰: 국소 극값 포함) 다음 봉부터 이 피벗 봉까지(첫 피벗은 세션
 *  첫 봉부터). ⚠ v8 legAmount 의 재현이 아니다 — 그건 legAmountOfPair(레벨 쌍 판). */
export function legAmountOf(grid: PointGrid, pivotIndex: number): string {
    const p = grid.pivots[pivotIndex];
    const prev = pivotIndex > 0 ? BigInt(grid.pivots[pivotIndex - 1].cum) : 0n;
    return (BigInt(p.cum) - prev).toString();
}

/** 옛 renewalAmount 재현 — 직전 레벨의 크로싱 봉(포함)부터 이 레벨 봉까지. 첫 레벨·국소 고점·저점은 null. */
export function renewalAmountOf(grid: PointGrid, pivotIndex: number): string | null {
    const p = grid.pivots[pivotIndex];
    if (p.kind !== "high" || p.cross === null) return null;
    return amountFrom(p.cross, p.cum);
}

/** 레벨 쌍의 leg 창 — 직전 레벨 쌍의 저점 다음 봉부터 이 레벨 고점 봉까지(시작 배타, 첫 레벨은 세션
 *  첫 봉부터). v8 의 `legAmountOf(고점 피벗)` 과 같은 값 — 피벗 색인 판(legAmountOf)은 경로 뷰 위의
 *  도구로 남고, 마디 뷰의 불변식 `0 < renewal ≤ leg` 은 recon·테스트가 이 함수로 검사한다. */
export function legAmountOfPair(pair: LevelPair, prevPair: LevelPair | null): string {
    const prev = prevPair === null ? 0n : BigInt(prevPair.low.cum);
    return (BigInt(pair.high.cum) - prev).toString();
}

/** 돌파 창 — 기준선 터치 봉(포함)부터 이 고점 봉까지. 미터치·터치가 고점보다 뒤면 null. */
export function breakoutAmountOf(grid: PointGrid, pivotIndex: number): string | null {
    const p = grid.pivots[pivotIndex];
    if (p.kind !== "high" || grid.touch === null || grid.touch.min > p.min) return null;
    return amountFrom(grid.touch, p.cum);
}

/** 시그널(Point 봉 시각) 이후 첫 **레벨** 고점(마디 뷰) — 없으면 null(꼬리 = 결손). 시그널 봉 자신이
 *  고점이면 그 봉. v9: 국소 고점 피벗은 다리 고점이 아니다 — 시그널 뒤 첫 확정 고점은 정리상 레벨이지만
 *  마디 뷰를 거쳐 명시한다(index 는 grid.pivots 색인 그대로 — legAmountOf 등 피벗 색인 도구와 호환). */
export function legHighOf(grid: PointGrid, pointMin: number): { pivot: GridPivot; index: number } | null {
    for (const pair of levelViewOf(grid)) {
        if (pair.high.min >= pointMin) return { pivot: pair.high, index: pair.highIndex };
    }
    return null;
}

/**
 * 다리 창의 시작 봉 = 시그널이 넘은 레벨의 크로싱. 돌파는 터치 봉, 재돌파는 **다음 레벨**의 `cross`
 * (마디 뷰에서 레벨은 연속이라 다음 레벨의 cross = 이 레벨 가격을 처음 넘은 봉 — v8 의 pivots[i+2] 와
 * 같은 값). 다음 레벨이 아직 없으면(꼬리) null.
 */
export function legStartOf(grid: PointGrid, point: Pick<DerivedPoint, "min" | "levelIdx" | "levelMin">): GridBarMark | null {
    if (point.levelIdx === 0 && point.levelMin === null) {
        // 돌파 창 시작 = 터치 봉 — 접근 Point(touch 게이트 폐지 후)는 터치가 없거나 Point 보다 뒤일 수
        // 있다: 그 창은 결손이다(음수 창 금지 — 미래 봉을 시작으로 쓰지 않는다).
        return grid.touch !== null && grid.touch.min <= point.min ? grid.touch : null;
    }
    if (point.levelMin === null) return null;
    const pairs = levelViewOf(grid);
    const k = pairs.findIndex((p) => p.high.min === point.levelMin);
    if (k < 0) return null;
    const next = pairs[k + 1];
    return next ? next.high.cross : null;
}

/** 다리 = 크로싱(시작 봉) → 다리 고점. 시간은 봉 차(분), amount 는 포함 창 누적 대금(원, string). */
export interface LegWindow {
    start: GridBarMark;
    high: GridPivot;
    /** 시작 봉 ~ 고점 봉 포함 누적 대금(원). */
    amount: string;
    /** 고점 봉 시각 − 시작 봉 시각(분, ≥ 0). 창 봉 수는 minutes + 1. */
    minutes: number;
}

export function legWindowOf(grid: PointGrid, point: Pick<DerivedPoint, "min" | "levelIdx" | "levelMin">): LegWindow | null {
    const high = legHighOf(grid, point.min);
    const start = legStartOf(grid, point);
    if (high === null || start === null || start.min > high.pivot.min) return null;
    return { start, high: high.pivot, amount: amountFrom(start, high.pivot.cum), minutes: high.pivot.min - start.min };
}
