// 골격 겹쳐 그리기의 **순수 계산** — 정규화(앵커 기준)와 화면 좌표 배치. 렌더에서 떼어낸 이유는
// 앵커 토글이 규칙이지 그림이 아니기 때문이다(첫 점 기준과 마지막 점 기준은 부호가 반대라 눈으로 못 잡는다).
//
// ## 정규화 = 앵커 피벗을 원점으로
// 골격마다 가격 스케일도 절대 시각도 다르므로, 한 피벗을 골라 (0%, t=0) 으로 맞춘다.
//   · first(P1)  — 시작점에서 모여 앞으로 퍼진다. 본상승 크기 비교에 맞다(t ≥ 0).
//   · last(P마지막) — **당일 직전이 한 점으로 정렬**되어 뒤로 퍼진다. "지금 여기서 뒤를 돌아본" 그림(t ≤ 0).
//
// ## 시간축을 늘리지 않는다
// 모든 골격을 같은 폭에 채우면(각자 0..1 로 스케일) 그림은 예뻐지지만 **기간이 사라진다** — 3일에 빠진 것과
// 3주에 걸친 것이 같은 모양이 된다. 기간이 관심사인데 그걸 지우면 그림이 거짓말을 한다. 그래서 시간축은
// 공통 척도(모든 골격의 t 범위 합집합)를 쓴다.
import type { SkeletonWirePivot } from "@trade-data-manager/wire";
import type { PointRef } from "../../lib/pointKey.js";

/** 정규화 기준 피벗. */
export type SkeletonAnchor = "first" | "last";

/**
 * 정규화된 골격 하나 — 화면 좌표 이전의 값 공간(x=앵커 대비 시간, y=앵커 대비 %).
 *
 * 식별은 **타점**이지 골격이 아니다. 일봉 골격은 차트 소유라 한 폴리라인을 같은 차트의 여러 타점이 공유하는데,
 * 색(결과)도 클릭 이동도 타점의 것이다 — 골격 쪽 식별을 그대로 쓰면 일봉에서 time 이 없어 둘 다 깨진다.
 */
export interface NormalizedSkeleton extends PointRef {
    key: string;
    points: { x: number; y: number }[];
    /** 앵커 피벗의 원 가격 — **같은 % 공간으로 다른 가격을 끌어오는 환산 계수**(기준선·D선을 얹을 때). */
    basePrice: number;
}

/** 값 공간의 경계. 비어 있으면 null(빈 화면 — 0으로 나누지 않는다). */
export interface OverlayBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

/**
 * 골격 하나를 앵커 기준으로 정규화한다. 피벗 2개 미만이거나 앵커 가격이 0 이하면 null
 * (그릴 수 없는 것을 0으로 지어내지 않는다 — 축 규칙 3과 같은 태도).
 */
export function normalizeSkeleton(pivots: readonly SkeletonWirePivot[], anchor: SkeletonAnchor, owner: PointRef & { key: string }): NormalizedSkeleton | null {
    if (pivots.length < 2) return null;
    const base = anchor === "first" ? pivots[0] : pivots[pivots.length - 1];
    if (base.price <= 0) return null;
    return {
        ...owner,
        basePrice: base.price,
        points: pivots.map((p) => ({ x: p.t - base.t, y: pct(p.price, base.price) })),
    };
}

/**
 * 가격 → 앵커 대비 %. 골격 피벗과 얹는 선(기준선·D선)이 **같은 함수**를 타야 한 공간에 놓인다 —
 * 선을 따로 환산하면 골격은 수정주가, 선은 원주가처럼 미세하게 어긋나도 그림으로는 안 보인다.
 */
export const pct = (price: number, basePrice: number): number => (price / basePrice - 1) * 100;

/** 여러 골격의 공통 경계. y 는 0(앵커 선)을 항상 포함시킨다 — 기준선이 화면 밖이면 읽을 수가 없다. */
export function overlayBounds(items: readonly NormalizedSkeleton[]): OverlayBounds | null {
    if (items.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = 0;
    let maxY = 0;
    for (const s of items) {
        for (const p of s.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
    return { minX, maxX, minY, maxY };
}

/**
 * 이상치를 뺀 초기 범위 — 값들의 [q, 1−q] 분위수.
 *
 * 공통 척도의 유일한 실질 문제가 이것이다: +300% 짜리 하나가 나머지를 전부 바닥에 눌러버린다.
 * **자르는 게 아니라 초기 뷰만 좁히는 것**이라 잘린 골격은 확대·이동으로 그대로 닿는다(정보를 안 버린다).
 * 0(앵커 선)은 언제나 포함 — 기준이 화면 밖이면 되돌림을 읽을 수가 없다.
 */
export function trimmedBounds(items: readonly NormalizedSkeleton[], q: number): OverlayBounds | null {
    if (items.length === 0 || q <= 0) return overlayBounds(items);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of items) for (const p of s.points) { xs.push(p.x); ys.push(p.y); }
    if (xs.length === 0) return null;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const lo = (v: number[]): number => v[Math.floor((v.length - 1) * q)];
    const hi = (v: number[]): number => v[Math.ceil((v.length - 1) * (1 - q))];
    return { minX: Math.min(lo(xs), 0), maxX: Math.max(hi(xs), 0), minY: Math.min(lo(ys), 0), maxY: Math.max(hi(ys), 0) };
}

/** 폴리라인 points 속성 문자열. 소수 2자리로 끊어 DOM 문자열이 불필요하게 길어지지 않게. */
export function polylinePoints(s: NormalizedSkeleton, sx: (x: number) => number, sy: (y: number) => number): string {
    return s.points.map((p) => `${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
}

/**
 * 겹쳐 그리기의 선 불투명도 — **개수에 반비례**한다.
 *
 * 고정값을 쓰면 골격 20개일 때는 흐리고 1000개일 때는 화면이 까맣게 찬다. 개수를 따라 낮추면 겹친 그림이
 * **밀도 지도**가 된다 — 많이 겹치는 경로는 진해지고 드문 경로는 흐려져서, 스파게티가 히스토그램으로 읽힌다.
 * 1/√n 은 겹침 그림에서 널리 쓰는 어림이다(정확한 포화점은 겹침 정도에 달렸는데 그건 미리 알 수 없다).
 * 위 클램프는 소수일 때 너무 진해지지 않게, 아래 클램프는 수천 개여도 완전히 사라지지 않게.
 */
export const lineOpacity = (n: number): number => (n <= 0 ? 0 : Math.min(0.55, Math.max(0.03, 1.8 / Math.sqrt(n))));

/** 강조 중일 때 나머지의 불투명도 — 기본값에 **비례**한다. 고정값이면 개수가 많을 때 흐림이 기본보다 진해진다. */
export const dimOpacity = (n: number): number => Math.max(0.015, lineOpacity(n) * 0.25);

/** 라벨이 붙는 점 — **앵커 반대쪽 끝**. 앵커 쪽은 모든 골격이 한 점에 모여 라벨을 붙일 자리가 없다. */
export const labelPointOf = (s: NormalizedSkeleton, anchor: SkeletonAnchor): { x: number; y: number } =>
    anchor === "last" ? s.points[0] : s.points[s.points.length - 1];

/** 라벨 자리 하나(화면 좌표). */
export interface LabelAnchor {
    key: string;
    x: number;
    y: number;
}

/** 한 칸에 모인 라벨들. members 가 1이면 라벨을, 여럿이면 개수 뱃지를 그린다. */
export interface LabelCluster {
    x: number;
    y: number;
    members: string[];
}

/**
 * 화면공간 격자로 라벨을 묶는다(지도의 축약과 같은 방식).
 *
 * 개수 임계로 라벨을 **숨기면** 그 골격이 뭔지 알 길이 영영 없어진다. 묶으면 숨기는 게 아니라 **압축**이라,
 * 확대해서 화면 좌표가 벌어지면 칸이 쪼개지며 저절로 풀린다. 그래서 이 함수는 값 좌표가 아니라 **화면 좌표**를
 * 받는다 — 확대 배율이 곧 축약 수준이 되는 게 핵심이다.
 * 대표 위치는 그 칸의 첫 멤버 자리 — 중심을 쓰면 멤버가 하나 드나들 때마다 라벨이 흔들린다.
 */
export function clusterLabels(anchors: readonly LabelAnchor[], cellW: number, cellH: number): LabelCluster[] {
    const byCell = new Map<string, LabelCluster>();
    for (const a of anchors) {
        const cell = `${Math.floor(a.x / cellW)}|${Math.floor(a.y / cellH)}`;
        const found = byCell.get(cell);
        if (found) found.members.push(a.key);
        else byCell.set(cell, { x: a.x, y: a.y, members: [a.key] });
    }
    return [...byCell.values()];
}
