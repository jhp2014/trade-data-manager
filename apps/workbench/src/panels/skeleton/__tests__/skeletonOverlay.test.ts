import { describe, it, expect } from "vitest";
import { scaleLinear } from "d3-scale";
import { normalizeSkeleton, overlayBounds, trimmedBounds, polylinePoints, pct, lineOpacity, dimOpacity, labelPointOf, clusterLabels } from "../skeletonOverlay.js";
import type { SkeletonWirePivot } from "@trade-data-manager/wire";

const owner = { stockCode: "005930", date: "2026-08-05", time: "09:30:00", key: "005930|2026-08-05|09:30:00" };

// 저 → 고 → 저: 100 에서 150 까지 5일 오르고 3일에 걸쳐 120 으로 되돌린 골격.
const pivots: SkeletonWirePivot[] = [
    { t: 10, price: 100 },
    { t: 15, price: 150 },
    { t: 18, price: 120 },
];

describe("normalizeSkeleton", () => {
    it("첫 점 기준이면 원점에서 앞으로 퍼진다(t ≥ 0)", () => {
        const n = normalizeSkeleton(pivots, "first", owner)!;
        expect(n.points.map((p) => p.x)).toEqual([0, 5, 8]);
        expect(n.points[0].y).toBe(0);
        expect(n.points[1].y).toBeCloseTo(50);
        expect(n.points[2].y).toBeCloseTo(20);
    });

    it("마지막 점 기준이면 원점에서 뒤로 퍼진다(t ≤ 0)", () => {
        const n = normalizeSkeleton(pivots, "last", owner)!;
        expect(n.points.map((p) => p.x)).toEqual([-8, -3, 0]);
        // 120 이 기준이므로 100 은 아래, 150 은 위.
        expect(n.points[0].y).toBeCloseTo(-16.667, 3);
        expect(n.points[1].y).toBeCloseTo(25);
        expect(n.points[2].y).toBe(0);
    });

    it("식별은 골격이 아니라 타점 — 일봉 골격도 time 을 갖는다", () => {
        const n = normalizeSkeleton(pivots, "last", owner)!;
        expect(n).toMatchObject({ key: owner.key, stockCode: "005930", time: "09:30:00" });
    });

    it("앵커 원가격을 남긴다 — 얹는 선을 같은 % 공간으로 끌어오는 계수", () => {
        const n = normalizeSkeleton(pivots, "last", owner)!;
        expect(n.basePrice).toBe(120);
        // 기준선 90원은 마지막 점(120) 대비 -25%.
        expect(pct(90, n.basePrice)).toBeCloseTo(-25);
    });

    it("피벗이 2개 미만이면 골격이 아니다", () => {
        expect(normalizeSkeleton([{ t: 1, price: 100 }], "first", owner)).toBeNull();
    });

    it("앵커 가격이 0 이하면 정규화할 수 없다 — 0으로 지어내지 않는다", () => {
        expect(normalizeSkeleton([{ t: 1, price: 0 }, { t: 2, price: 10 }], "first", owner)).toBeNull();
    });
});

describe("overlayBounds", () => {
    it("y 는 0(기준선)을 항상 포함한다 — 화면 밖이면 되돌림을 읽을 수 없다", () => {
        // 전부 기준 위에 있는 골격 하나 → minY 가 0 으로 내려와야 한다.
        const n = normalizeSkeleton(pivots, "first", owner)!;
        const b = overlayBounds([n])!;
        expect(b.minY).toBe(0);
        expect(b.maxY).toBeCloseTo(50);
        expect(b.minX).toBe(0);
        expect(b.maxX).toBe(8);
    });

    it("빈 목록은 경계가 없다", () => {
        expect(overlayBounds([])).toBeNull();
    });
});

describe("trimmedBounds", () => {
    // 이상치 하나가 나머지를 바닥에 누르는 상황 — 공통 척도의 유일한 실질 문제.
    const many = Array.from({ length: 20 }, (_, i) =>
        normalizeSkeleton([{ t: 0, price: 100 }, { t: 2, price: 110 }], "first", { ...owner, key: `k${i}` })!,
    );
    const outlier = normalizeSkeleton([{ t: 0, price: 100 }, { t: 2, price: 400 }], "first", { ...owner, key: "out" })!;

    it("양끝 분위수를 뺀 범위를 준다 — 이상치가 척도를 지배하지 않게", () => {
        const full = overlayBounds([...many, outlier])!;
        const trimmed = trimmedBounds([...many, outlier], 0.05)!;
        expect(full.maxY).toBeCloseTo(300);
        expect(trimmed.maxY).toBeLessThan(full.maxY);
    });

    it("0(앵커 선)은 언제나 범위 안 — 기준이 화면 밖이면 되돌림을 못 읽는다", () => {
        const b = trimmedBounds(many, 0.4)!;
        expect(b.minY).toBeLessThanOrEqual(0);
        expect(b.maxY).toBeGreaterThanOrEqual(0);
        expect(b.minX).toBeLessThanOrEqual(0);
    });

    it("q 가 0이면 전체 범위 그대로", () => {
        expect(trimmedBounds([...many, outlier], 0)).toEqual(overlayBounds([...many, outlier]));
    });
});

describe("lineOpacity / dimOpacity", () => {
    it("개수가 늘수록 옅어진다 — 겹친 그림이 밀도 지도가 되도록", () => {
        expect(lineOpacity(10)).toBeGreaterThan(lineOpacity(100));
        expect(lineOpacity(100)).toBeGreaterThan(lineOpacity(1000));
    });

    it("소수여도 과하게 진하지 않고, 수천이어도 사라지지 않는다", () => {
        expect(lineOpacity(1)).toBeLessThanOrEqual(0.55);
        expect(lineOpacity(100000)).toBeGreaterThanOrEqual(0.03);
    });

    it("흐림은 언제나 기본보다 옅다 — 고정값이면 개수가 많을 때 역전된다", () => {
        for (const n of [5, 50, 500, 5000]) expect(dimOpacity(n)).toBeLessThan(lineOpacity(n));
    });
});

describe("labelPointOf / clusterLabels", () => {
    it("라벨은 앵커 반대쪽 끝에 붙는다", () => {
        const last = normalizeSkeleton(pivots, "last", owner)!;
        expect(labelPointOf(last, "last").x).toBe(-8); // 왼쪽 끝
        const first = normalizeSkeleton(pivots, "first", owner)!;
        expect(labelPointOf(first, "first").x).toBe(8); // 오른쪽 끝
    });

    it("같은 칸에 든 것들이 하나로 묶인다", () => {
        const c = clusterLabels([
            { key: "a", x: 10, y: 10 },
            { key: "b", x: 20, y: 12 },
            { key: "c", x: 400, y: 200 },
        ], 74, 13);
        expect(c).toHaveLength(2);
        expect(c[0].members).toEqual(["a", "b"]);
        expect(c[1].members).toEqual(["c"]);
    });

    it("대표 위치는 첫 멤버 자리 — 중심이면 멤버가 드나들 때마다 라벨이 흔들린다", () => {
        const c = clusterLabels([{ key: "a", x: 10, y: 10 }, { key: "b", x: 20, y: 12 }], 74, 13);
        expect(c[0]).toMatchObject({ x: 10, y: 10 });
    });

    it("좌표가 벌어지면(확대) 칸이 쪼개진다 — 숨김이 아니라 압축이라는 성질", () => {
        const near = [{ key: "a", x: 10, y: 10 }, { key: "b", x: 30, y: 10 }];
        const far = near.map((a) => ({ ...a, x: a.x * 8 })); // 8배 확대
        expect(clusterLabels(near, 74, 13)).toHaveLength(1);
        expect(clusterLabels(far, 74, 13)).toHaveLength(2);
    });
});

describe("d3 스케일과의 조합", () => {
    it("범위가 0폭이어도 가운데로 접힌다(0으로 나누지 않는다)", () => {
        // d3-scale 은 domain 폭이 0이면 range 중앙 상수를 낸다 — 손으로 짜던 가드가 여기 흡수됐다.
        expect(scaleLinear().domain([3, 3]).range([0, 100])(3)).toBe(50);
    });

    it("SVG points 문자열을 만든다", () => {
        const n = normalizeSkeleton(pivots, "first", owner)!;
        const b = overlayBounds([n])!;
        const x = scaleLinear().domain([b.minX, b.maxX]).range([0, 80]);
        const y = scaleLinear().domain([b.minY, b.maxY]).range([50, 0]); // y 뒤집기 = range 역순
        expect(polylinePoints(n, x, y)).toBe("0.00,50.00 50.00,0.00 80.00,30.00");
    });
});
