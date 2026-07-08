// core/market/domain/review — 타점 속성(outcome/type) 패싯 집계·필터(순수). 가설 필터 2단계.
// 속성은 단일값이라 boolean 이 아니라 다중선택 패싯이 맞는 관용구. attr 을 제네릭으로 두어
// **type 추가 = PointAttr 한 줄 + 호출 인자만**(새 로직 0). 패싯 내부 OR, 패싯 간 AND(클라 조합).
// 집계는 가설필터 결과(P1) 기준으로 계산 = 화면 본론("이 가설조합 타점의 outcome 분포").
import type { ReviewPoint } from "./reviewPoint.js";

/** 패싯 대상 속성. outcome 우선, type 은 나중에 동일 메커니즘으로 추가. */
export type PointAttr = "outcome" | "type";

/** 한 속성값의 집계 버킷. value=null → 미분류(속성 없음). */
export interface FacetBucket {
    value: string | null;
    pointCount: number; // 타점 수
    stockCount: number; // distinct 종목 수(같은 종목 여러 outcome 이면 각 버킷에 중복 계상)
}

function attrOf(p: ReviewPoint, attr: PointAttr): string | null {
    const v = attr === "outcome" ? p.outcome : p.type;
    return v == null || v === "" ? null : v;
}

/** 속성별 집계(타점 수 + distinct 종목 수). 타점 수 내림차순, 미분류(null) 맨 뒤. */
export function aggregateByAttr(points: ReviewPoint[], attr: PointAttr): FacetBucket[] {
    const counts = new Map<string | null, number>();
    const codes = new Map<string | null, Set<string>>();
    for (const p of points) {
        const v = attrOf(p, attr);
        counts.set(v, (counts.get(v) ?? 0) + 1);
        let s = codes.get(v);
        if (!s) {
            s = new Set<string>();
            codes.set(v, s);
        }
        s.add(p.stockCode);
    }
    const buckets: FacetBucket[] = [...counts].map(([value, pointCount]) => ({
        value,
        pointCount,
        stockCount: codes.get(value)!.size,
    }));
    buckets.sort((a, b) => {
        if ((a.value === null) !== (b.value === null)) return a.value === null ? 1 : -1;
        return b.pointCount - a.pointCount;
    });
    return buckets;
}

/** 선택된 속성값만 통과(다중선택 = OR). 선택이 비면 전체 통과(패싯 미적용). null 선택 = 미분류 포함. */
export function applyFacet<P extends ReviewPoint>(points: P[], attr: PointAttr, selected: ReadonlySet<string | null>): P[] {
    if (selected.size === 0) return points;
    return points.filter((p) => selected.has(attrOf(p, attr)));
}

/** distinct 종목 수(헤드라인 "N종목·M타점"의 종목 쪽). */
export function distinctStockCount(points: ReviewPoint[]): number {
    return new Set(points.map((p) => p.stockCode)).size;
}
