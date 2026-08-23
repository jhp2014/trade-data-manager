// 골격 패널 은퇴 때 살아남은 공용 캔버스 층의 테스트 — 옛 skeletonOverlay.test / amountLayer.test 에서 이식.
import { describe, it, expect } from "vitest";
import { amountRuns, spreadByY, LEVEL_MISSING, LEVEL_QUIET } from "../amountRuns.js";
import { amountLevelOf, runWidth } from "../amountScale.js";

describe("amountRuns — 선을 분 단위로 잘라 굵기 단계 런으로", () => {
    // 테스트용 단계 판정: 10 이상이면 2단계, 5 이상이면 1단계, 그 아래는 0(구간 아래).
    const levelOf = (won: number): number => (won >= 10 ? 2 : won >= 5 ? 1 : LEVEL_QUIET);
    /** 분 → 거래대금. 543분에만 20 이 터지고 나머지는 1. */
    const at = (m: number): number | null => (m < 540 || m > 546 ? null : m === 543 ? 20 : 1);

    it("피벗 사이 직선을 분마다 자르고 y 는 선형 보간 — 형태는 안 바뀌고 굵기 해상도만 오른다", () => {
        const runs = amountRuns([{ x: 540, y: 0 }, { x: 546, y: 6 }], 0, at, levelOf);
        // 조용한 구간 → 스파이크(543분) → 다시 조용 = 런 3개(같은 단계는 합쳐진다)
        expect(runs.map((r) => r.level)).toEqual([LEVEL_QUIET, 2, LEVEL_QUIET]);
        expect(runs[0].points).toEqual([{ x: 540, y: 0 }, { x: 541, y: 1 }, { x: 542, y: 2 }]); // 기울기 1 그대로
        expect(runs[1].points).toEqual([{ x: 542, y: 2 }, { x: 543, y: 3 }]); // 543분 봉 = 그 조각
        expect(runs[2].points[runs[2].points.length - 1]).toEqual({ x: 546, y: 6 });
    });

    it("**꼭짓점을 안 버린다** — 병합이 끝점만 옮기면 그 사이 꺾임이 사라져 선이 현으로 뭉개진다", () => {
        // 540→543 상승, 543→546 하락. 전부 조용해서 한 런으로 합쳐지지만 꺾임(543)은 남아야 한다.
        const quiet = (): number => 1;
        const runs = amountRuns([{ x: 540, y: 0 }, { x: 543, y: 9 }, { x: 546, y: 0 }], 0, quiet, levelOf);
        expect(runs).toHaveLength(1);
        expect(runs[0].points).toContainEqual({ x: 543, y: 9 }); // 이게 빠지면 (540,0)→(546,0) 직선이 된다
        expect(runs[0].points[0]).toEqual({ x: 540, y: 0 });
        expect(runs[0].points[runs[0].points.length - 1]).toEqual({ x: 546, y: 0 });
    });

    it("**스파이크가 평균에 안 묻힌다** — 이게 선분 평균을 버린 이유", () => {
        const runs = amountRuns([{ x: 540, y: 0 }, { x: 546, y: 6 }], 0, at, levelOf);
        expect(runs.some((r) => r.level === 2)).toBe(true); // 6분 평균이면 (5×1+20)/6 ≈ 4.2 → 구간 아래가 됐을 값
        const hot = runs.find((r) => r.level === 2)!;
        expect(hot.maxAmount).toBe(20); // 라벨이 쓰는 최대
        expect(hot.maxAt).toEqual({ x: 543, y: 3 }); // 라벨이 붙는 자리 = **터진 그 분**(런 중점이 아니라)
    });

    it("상대 좌표(x 는 상대분)도 baseT 로 벽시계를 찾고, x 는 상대 그대로 낸다", () => {
        const abs = amountRuns([{ x: 540, y: 0 }, { x: 546, y: 6 }], 0, at, levelOf);
        const rel = amountRuns([{ x: -3, y: 0 }, { x: 3, y: 6 }], 543, at, levelOf);
        expect(rel.map((r) => r.level)).toEqual(abs.map((r) => r.level));
        expect(rel[0].points[0].x).toBe(-3); // 좌표계는 그 선의 것을 유지한다
    });

    it("분봉이 없는 구간은 **재료 없음**으로 — 조용한 것과 구분된다(굵기도 갈린다)", () => {
        const runs = amountRuns([{ x: 600, y: 0 }, { x: 603, y: 3 }], 0, at, levelOf);
        expect(runs.map((r) => r.level)).toEqual([LEVEL_MISSING]);
    });

    it("길이 0·역방향 구간은 건너뛴다(0으로 나누지 않는다)", () => {
        expect(amountRuns([{ x: 540, y: 0 }, { x: 540, y: 5 }], 0, at, levelOf)).toEqual([]);
    });

    it("점이 하나면 선이 아니다", () => {
        expect(amountRuns([{ x: 540, y: 0 }], 0, at, levelOf)).toEqual([]);
    });
});

describe("spreadByY — 겹치는 라벨은 탈락이 아니라 이동", () => {
    const p = (x: number, y: number, group: string) => ({ x, y, group });

    it("멀리 떨어져 있으면 제자리 그대로", () => {
        const got = spreadByY([p(0, 0, "a"), p(0, 100, "b")], 52, 12);
        expect(got.map((g) => g.labelY)).toEqual([0, 100]);
    });

    it("붙어 있으면 최소 간격까지 벌린다 — 개수는 안 줄어든다", () => {
        const got = spreadByY([p(0, 50, "a"), p(0, 52, "b"), p(0, 54, "c")], 52, 12);
        expect(got).toHaveLength(3);
        const ys = got.map((g) => g.labelY).sort((m, n) => m - n);
        expect(ys[1] - ys[0]).toBeCloseTo(12);
        expect(ys[2] - ys[1]).toBeCloseTo(12);
    });

    it("무리 전체가 원래 중심에 남는다 — 아래로만 밀리면 원 자리에서 통째로 떨어진다", () => {
        const items = [p(0, 50, "a"), p(0, 52, "b"), p(0, 54, "c")];
        const got = spreadByY(items, 52, 12);
        const mean = (v: number[]): number => v.reduce((s, n) => s + n, 0) / v.length;
        expect(mean(got.map((g) => g.labelY))).toBeCloseTo(mean(items.map((i) => i.y)));
    });

    it("가로로 먼 것끼리는 안 다툰다 — 겹칠 수 없는 것을 벌리면 자리만 낭비한다", () => {
        const got = spreadByY([p(0, 50, "a"), p(500, 50, "b")], 52, 12);
        expect(got.map((g) => g.labelY)).toEqual([50, 50]);
    });

    it("순서를 안 뒤집는다 — 위에 있던 게 아래로 가면 지시선이 엇갈린다", () => {
        const got = spreadByY([p(0, 54, "c"), p(0, 50, "a"), p(0, 52, "b")], 52, 12);
        const byGroup = new Map(got.map((g) => [g.group, g.labelY]));
        expect(byGroup.get("a")!).toBeLessThan(byGroup.get("b")!);
        expect(byGroup.get("b")!).toBeLessThan(byGroup.get("c")!);
    });
});

describe("runWidth / amountLevelOf — 굵기 척도", () => {
    it("구간 아래는 0단계 — 조용한 구간도 선이긴 하다", () => {
        expect(amountLevelOf(1)).toBe(0);
    });

    it("금액이 커지면 단계가 안 줄어든다(단조)", () => {
        const levels = [1e7, 1e8, 1e9, 1e10, 1e11].map(amountLevelOf);
        for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    });

    // 재료 없음(분봉 결손)을 조용한 구간과 **같은 굵기로 그리면** "거래가 없었다"와 "모른다"가 한 모양이다.
    it("결손은 가장 조용한 것보다도 가늘다 — 없음과 없었음을 눈으로 가른다", () => {
        expect(runWidth(LEVEL_MISSING, 1)).toBeLessThan(runWidth(0, 1));
    });

    it("배수는 그대로 곱해진다 — 얇은 선도 같은 척도를 쓴다", () => {
        expect(runWidth(1, 2)).toBeCloseTo(runWidth(1, 1) * 2);
    });
});
