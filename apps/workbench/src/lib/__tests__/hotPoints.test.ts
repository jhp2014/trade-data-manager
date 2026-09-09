// 급타점 수의 불변식 — 규칙 원문은 `.claude/decisions.md` 「급타점 수 축」 절.
// 여기서 못박는 것은 "창 안 완결"·"연속 쌍"·"P 이전 쌍도 센다"·"차트 경계"·"경계값 포함" 다섯이다.
import { describe, expect, it } from "vitest";
import { HOT_PARAM_LADDER, hotCountsOf, hotPairsOf, nextFreeHotParams } from "../hotPoints.js";
import { pointKeyOf } from "../pointKey.js";
import type { AutoPoint } from "../usePointGrids.js";

/** 타점 하나 — 이 축이 보는 건 (차트, 분, 종가) 셋뿐이라 나머지는 자리만 채운다. */
const pt = (stockCode: string, date: string, min: number, close: number): AutoPoint => ({
    stockCode,
    date,
    time: `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`,
    point: {
        kind: "renewal", ordinal: 0, min, high: close, close, tv: "0",
        levelPrice: close, levelIdx: 0, levelMin: null,
    } as AutoPoint["point"],
});

const countAt = (points: AutoPoint[], w: number, r: number, at: AutoPoint): number | undefined =>
    hotCountsOf(points, w, r).byKey.get(pointKeyOf(at.stockCode, at.date, at.time));

describe("hotCountsOf", () => {
    it("첫 타점은 0이다 — 결손(undefined)이 아니다", () => {
        // 0 을 결손으로 내면 3치 판정이 미배치로 세어 첫 돌파가 필터 밖으로 샌다.
        const a = pt("000660", "2025-07-01", 540, 10000);
        const counts = hotCountsOf([a], 60, 3);
        expect(counts.byKey.get(pointKeyOf(a.stockCode, a.date, a.time))).toBe(0);
        expect(counts.values).toHaveLength(1);
        expect(counts.values[0]!.value).toBe(0);
    });

    it("연속 쌍만 센다 — 창 안 모든 순서쌍이 아니다", () => {
        // 세 타점이 각각 +5% 씩: 연속 쌍은 2개(P1→P2, P2→P3). 모든 순서쌍이면 P1→P3 까지 3개가 된다.
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("000660", "2025-07-01", 550, 10500),
            pt("000660", "2025-07-01", 560, 11025),
        ];
        expect(countAt(ps, 60, 3, ps[2]!)).toBe(2);
    });

    it("P 이전에서 끝난 쌍도 센다 — 직전 쌍만 보면 n−2 문제가 재발한다", () => {
        // P1→P2 는 +14%(급함), P2→P3 는 +1%(완만). 직전만 보면 0 이지만 부담은 실재한다.
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("000660", "2025-07-01", 555, 11400),
            pt("000660", "2025-07-01", 565, 11514),
        ];
        expect(countAt(ps, 60, 3, ps[2]!)).toBe(1);
    });

    it("쌍의 두 점이 모두 창 안일 때만 센다 — 기울기 하한 r/W 의 근거", () => {
        // P1(540)→P2(560) 은 +5%. P3 는 621분이라 창 60분의 왼쪽 끝이 561 — P1 이 밖이라 그 쌍은 빠진다.
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("000660", "2025-07-01", 560, 10500),
            pt("000660", "2025-07-01", 621, 10600),
        ];
        expect(countAt(ps, 60, 3, ps[2]!)).toBe(0);
        // 창을 넓히면 그 쌍이 다시 들어온다(P1 이 561 이상이 되는 W = 81).
        expect(countAt(ps, 81, 3, ps[2]!)).toBe(1);
    });

    it("경계값은 포함이다 — 상승률이 정확히 r, 앞 점이 정확히 tₙ−W", () => {
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("000660", "2025-07-01", 550, 10300), // 정확히 +3%
            pt("000660", "2025-07-01", 600, 10300), // tₙ−W = 540 → 앞 점이 딱 걸린다
        ];
        expect(countAt(ps, 60, 3, ps[2]!)).toBe(1);
        // r 을 조금만 올리면 그 쌍이 빠진다(경계가 실제로 판정에 쓰인다는 확인).
        expect(countAt(ps, 60, 3.5, ps[2]!)).toBe(0);
    });

    it("하락 쌍은 r 미달로 자동 제외된다 — 종가 비단조가 무해하다", () => {
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("000660", "2025-07-01", 550, 9000), // 슬롯 2 처럼 앞보다 낮은 종가
            pt("000660", "2025-07-01", 560, 9200),
        ];
        expect(countAt(ps, 60, 3, ps[2]!)).toBe(0);
    });

    it("쌍은 같은 (종목,날짜) 안에서만 — 날짜·종목 경계를 안 넘는다", () => {
        const other = pt("000660", "2025-07-02", 541, 20000); // 다음 날, 다른 가격
        const same = pt("000660", "2025-07-01", 540, 10000);
        const another = pt("005930", "2025-07-01", 541, 30000); // 다른 종목
        const target = pt("000660", "2025-07-02", 550, 24000); // 전날·타종목과 짝지어지면 안 된다
        expect(countAt([same, another, other, target], 60, 3, target)).toBe(1); // other→target 한 쌍뿐
    });

    it("값은 전 타점에 선다 — 결손이 없다", () => {
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("005930", "2025-07-01", 545, 20000),
            pt("000660", "2025-07-02", 550, 30000),
        ];
        const counts = hotCountsOf(ps, 60, 3);
        expect(counts.byKey.size).toBe(3);
        expect(counts.values).toHaveLength(3);
    });
});

describe("hotPairsOf", () => {
    it("연속 쌍의 간격·상승률을 W·r 과 무관하게 낸다 — 레일 과녁이 드래그 중 안 흔들린다", () => {
        const ps = [
            pt("000660", "2025-07-01", 540, 10000),
            pt("000660", "2025-07-01", 560, 10500),
            pt("000660", "2025-07-01", 600, 10500),
            pt("005930", "2025-07-01", 540, 20000), // 다른 종목 — 앞 차트와 쌍을 만들지 않는다
        ];
        const { spans, rises } = hotPairsOf(ps);
        expect(spans).toEqual([20, 40]);
        expect(rises[0]).toBeCloseTo(5, 6);
        expect(rises[1]).toBeCloseTo(0, 6);
    });
});

describe("nextFreeHotParams — 생성이 같은 레일 자리를 겹치지 않는다", () => {
    it("아무것도 없으면 사다리 첫 칸", () => {
        expect(nextFreeHotParams([])).toEqual(HOT_PARAM_LADDER[0]);
    });

    it("앞 칸이 차 있으면 다음 빈 칸 — 늘 (60,3) 을 만들면 컷이 연동 표시와 다른 행에 들어간다", () => {
        expect(nextFreeHotParams([{ w: 60, r: 3 }])).toEqual(HOT_PARAM_LADDER[1]);
        expect(nextFreeHotParams([{ w: 60, r: 3 }, { w: 30, r: 3 }])).toEqual(HOT_PARAM_LADDER[2]);
    });

    it("순서와 무관하게 빈 칸을 찾는다", () => {
        expect(nextFreeHotParams([{ w: 30, r: 3 }])).toEqual(HOT_PARAM_LADDER[0]);
    });

    it("사다리가 전부 차면 null — 겹치는 행을 만드느니 안 만든다", () => {
        expect(nextFreeHotParams(HOT_PARAM_LADDER)).toBeNull();
    });
});
