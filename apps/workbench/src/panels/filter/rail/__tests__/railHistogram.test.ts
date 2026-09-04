// 펼침 분포의 셈 — 두 겹이 **같은 칸**에서 맞물리나, 로그 높이가 천장 없이 자라나.
import { describe, expect, it } from "vitest";
import { binCenter, histogramOf, logHeight } from "../railHistogram.js";

describe("histogramOf — 모수와 멤버가 같은 칸 색인을 쓴다", () => {
    it("칸마다 건수를 세고, 멤버는 같은 칸에 얹힌다", () => {
        const { bins, max } = histogramOf([0.05, 0.06, 0.55, 0.95], [0.06, 0.95], 10);
        expect(bins).toHaveLength(10);
        expect(bins[0]).toEqual({ count: 2, member: 1 });
        expect(bins[5]).toEqual({ count: 1, member: 0 });
        expect(bins[9]).toEqual({ count: 1, member: 1 });
        expect(max).toBe(2);
    });

    it("오른쪽 끝(1.0)은 마지막 칸에 들어간다 — 칸이 하나 넘치지 않는다", () => {
        const { bins } = histogramOf([1, 1.4, -0.2], undefined, 4);
        expect(bins[3]!.count).toBe(2);
        expect(bins[0]!.count).toBe(1); // 도메인 밖은 끝으로 클램프
    });

    it("멤버가 없으면 멤버 층은 전부 0 — 그림이 없는 걸 지어내지 않는다", () => {
        const { bins } = histogramOf([0.1, 0.2], undefined, 4);
        expect(bins.every((b) => b.member === 0)).toBe(true);
    });
});

describe("logHeight — 알파가 못 하는 일(천장 없음)", () => {
    it("0 건은 0 — 빈 칸에 최소 높이를 주면 '여기 하나도 없다'가 사라진다", () => {
        expect(logHeight(0, 118)).toBe(0);
        expect(logHeight(5, 0)).toBe(0);
    });

    it("최다 칸이 1, 그 아래는 로그로 눌린다 — 낱개도 보이고 봉우리도 안 넘친다", () => {
        expect(logHeight(118, 118)).toBeCloseTo(1, 6);
        expect(logHeight(1, 118)).toBeCloseTo(Math.log(2) / Math.log(119), 6);
        // 알파 누적(1-(1-0.35)^n)이 n=10 에서 이미 0.99 로 포화하는 자리에서, 높이는 아직 절반이다.
        expect(logHeight(10, 118)).toBeLessThan(0.55);
        expect(logHeight(10, 118)).toBeGreaterThan(logHeight(9, 118));
    });
});

describe("binCenter", () => {
    it("칸의 가운데 자리 — 컷 판정과 툴팁 값이 같은 기준을 본다", () => {
        expect(binCenter(0, 10)).toBeCloseTo(0.05, 6);
        expect(binCenter(9, 10)).toBeCloseTo(0.95, 6);
    });
});
