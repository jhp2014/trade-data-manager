// core/market/domain/grid/windows — 격자의 대금 창·다리 고점 파생(읽기 층, 순수). 규칙: decisions.md
// "대금은 창이 아니라 누적 스냅샷으로 굽는다" · "시그널 렌즈" 절.
//
// 격자는 기록 봉마다 세션 누적 대금(`cum`, 그 봉 포함)만 굽고, 창은 여기서 두 기록 봉의 차로 낸다:
//   포함 창 [a..b]      = b.cum − a.cum + a.tv   (a 는 창의 시작이 될 수 있는 봉 — GridBarMark·신고가 캔들)
//   시작 배타 창 (a..b] = b.cum − a.cum           (a 는 피벗 — 직전 피벗 "다음 봉부터")
// 옛 legAmount/renewalAmount 는 각각 `legAmountOf`/`renewalAmountOf` 로 재현되고, 불변식 0 < renewal ≤ leg 는
// 이 파생값의 성질로 남는다(windows.test).
//
// 다리 고점(`legHighOf`) = 시그널 이후 첫 확정 고점 피벗. 확정 고점이 서기 전엔 새 레벨·새 시그널이 없으므로
// 시그널→다리 고점은 최대 하나(≤1:1), 없으면 꼬리(세션 끝까지 −2% 안 빠짐) = 결손. 다리 창의 시작
// (`legStartOf`) = 시그널이 넘은 레벨의 크로싱: 돌파(레벨 0)는 기준선 터치 봉, 재돌파는 그 레벨(전고점)
// 피벗 **다음 확정 고점**이 든 `cross`(= 전고점 가격을 처음 넘은 봉). 병합(mergeRisePct)으로 다리 고점이
// 더 뒤로 가도 크로싱 기록은 같은 자리다(그 다음 고점이 "L 의 크로싱"을 들고 있다).
// `DerivedPoint` 에 필드로 넣지 않는 이유: pointsOf 판정은 렌즈를 모른다(행 정체성·행 시각 계약) —
// 다리 고점은 소비처(축·차트 표식·outcome 시뮬)가 필요할 때 격자를 더 보고 얻는 파생이다.
import type { GridBarMark, GridPivot, PointGrid } from "./grid.js";
import type { DerivedPoint } from "./points.js";

/** 포함 창 [start .. 끝 봉] 의 누적 대금(원, string). endCum = 끝 봉의 cum(그 봉 포함). */
export function amountFrom(start: GridBarMark, endCum: string): string {
    return (BigInt(endCum) - BigInt(start.cum) + BigInt(start.tv)).toString();
}

/** 옛 legAmount 재현 — 직전 피벗 다음 봉부터 이 피벗 봉까지(첫 피벗은 세션 첫 봉부터). */
export function legAmountOf(grid: PointGrid, pivotIndex: number): string {
    const p = grid.pivots[pivotIndex];
    const prev = pivotIndex > 0 ? BigInt(grid.pivots[pivotIndex - 1].cum) : 0n;
    return (BigInt(p.cum) - prev).toString();
}

/** 옛 renewalAmount 재현 — 직전 확정 고점의 크로싱 봉(포함)부터 이 고점 봉까지. 첫 고점·저점은 null. */
export function renewalAmountOf(grid: PointGrid, pivotIndex: number): string | null {
    const p = grid.pivots[pivotIndex];
    if (p.kind !== "high" || p.cross === null) return null;
    return amountFrom(p.cross, p.cum);
}

/** 돌파 창 — 기준선 터치 봉(포함)부터 이 고점 봉까지. 미터치·터치가 고점보다 뒤면 null. */
export function breakoutAmountOf(grid: PointGrid, pivotIndex: number): string | null {
    const p = grid.pivots[pivotIndex];
    if (p.kind !== "high" || grid.touch === null || grid.touch.min > p.min) return null;
    return amountFrom(grid.touch, p.cum);
}

/** 시그널(Point 봉 시각) 이후 첫 확정 고점 피벗 — 없으면 null(꼬리 = 결손). 시그널 봉 자신이 고점이면 그 봉. */
export function legHighOf(grid: PointGrid, pointMin: number): { pivot: GridPivot; index: number } | null {
    for (let i = 0; i < grid.pivots.length; i++) {
        const p = grid.pivots[i];
        if (p.kind === "high" && p.min >= pointMin) return { pivot: p, index: i };
    }
    return null;
}

/**
 * 다리 창의 시작 봉 = 시그널이 넘은 레벨의 크로싱. 돌파는 터치 봉, 재돌파는 레벨 피벗 다음 확정 고점의 `cross`
 * (피벗은 high/low 교대라 레벨 피벗 i 의 다음 고점은 i+2). 다음 고점이 아직 없으면(꼬리) null.
 */
export function legStartOf(grid: PointGrid, point: Pick<DerivedPoint, "levelIdx" | "levelMin">): GridBarMark | null {
    if (point.levelIdx === 0) return grid.touch;
    if (point.levelMin === null) return null;
    const i = grid.pivots.findIndex((p) => p.kind === "high" && p.min === point.levelMin);
    if (i < 0) return null;
    const next = grid.pivots[i + 2];
    return next && next.kind === "high" ? next.cross : null;
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
