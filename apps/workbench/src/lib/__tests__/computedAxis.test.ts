import { describe, it, expect } from "vitest";
import { buildFracIndex, computedAxisView, formatAxisValue, nearestPointAt, nearestPointInIndex, valueDomain, valueToFrac } from "../computedAxis.js";
import type { ComputedAxisFeed, ComputedAxisPoint } from "@trade-data-manager/wire";

const feed = (over: Partial<ComputedAxisFeed> = {}): ComputedAxisFeed => ({
    key: "fake",
    name: "가짜 축",
    strongerWhen: "higher",
    values: [{ stockCode: "005930", date: "2026-07-02", time: "09:30:00", value: 3 }],
    ...over,
});


describe("formatAxisValue", () => {
    it("규격이 없으면 등락률 모양 — 기존 축 둘의 표시가 그대로 유지된다", () => {
        expect(formatAxisValue(12.34)).toBe("+12.3%");
        expect(formatAxisValue(-4)).toBe("-4.0%");
        expect(formatAxisValue(0)).toBe("0.0%");
    });

    it("규격을 주면 단위·자릿수·부호가 축을 따른다", () => {
        const days = { suffix: "일", decimals: 0, signed: false };
        expect(formatAxisValue(3, days)).toBe("3일"); // 거래일 수에 "+3.0%" 가 붙으면 거짓말이 된다
        expect(formatAxisValue(0, days)).toBe("0일");
    });

    it("네 자리부터 천단위 구분자 — 시총(억) 가독. 소수부·음수엔 안 새어든다", () => {
        expect(formatAxisValue(-1234.5678, { suffix: "", decimals: 2, signed: true })).toBe("-1,234.57");
        expect(formatAxisValue(12.34)).toBe("+12.3%"); // 기존 % 축 표기 불변
    });

    it("억 단위 축은 1조부터 조로 접는다(소수 한 자리) — 값의 계약(억원)은 그대로", () => {
        const eok = { suffix: "억", decimals: 0, signed: false };
        expect(formatAxisValue(500, eok)).toBe("500억");
        expect(formatAxisValue(3000, eok)).toBe("3,000억"); // 1조 미만은 억 + 구분자
        expect(formatAxisValue(43000, eok)).toBe("4.3조");
        expect(formatAxisValue(19848000, eok)).toBe("1,984.8조"); // 조 표기에도 구분자
    });
});

describe("computedAxisView", () => {
    it("축의 표시 규격을 fmt 로 싸서 넘긴다 — 화면이 축별 분기를 갖지 않게", () => {
        const v = computedAxisView(feed({ display: { suffix: "일", decimals: 0, signed: false } }));
        expect(v.fmt(3)).toBe("3일");
    });

    it("strongerWhen=lower 면 orderKey 부호를 뒤집는다(큰 orderKey = 강 관례)", () => {
        expect(computedAxisView(feed({ strongerWhen: "lower" })).line[0].orderKey).toBe(-3);
        expect(computedAxisView(feed()).line[0].orderKey).toBe(3);
    });
});

describe("computedAxisView 포화(우측 절단) 자리잡기", () => {
    const pt = (time: string, value: number, saturated?: true): ComputedAxisPoint => ({
        stockCode: "005930", date: "2026-07-02", time, value, ...(saturated ? { saturated } : {}),
    });
    const key = (time: string): string => `005930|2026-07-02|${time}`;

    it("포화는 실측 최대 다음 한 칸 — 척도를 찌그러뜨리지 않고 실측 위에 선다", () => {
        // 서버가 준 하한(4)이 실측 최대(12)보다 작아도 자리는 위여야 한다.
        const v = computedAxisView(feed({ values: [pt("09:00:00", 12), pt("09:10:00", 4, true)] }));
        expect(v.values.get(key("09:10:00"))).toBe(13);
        expect(v.values.get(key("09:00:00"))).toBe(12);
    });

    it("포화끼리는 같은 칸 — slotId 가 같아 자동으로 동률", () => {
        const v = computedAxisView(feed({ values: [pt("09:00:00", 5), pt("09:10:00", 0, true), pt("09:20:00", 300, true)] }));
        const slots = v.line.filter((p) => p.time !== "09:00:00").map((p) => p.orderKey);
        expect(new Set(slots).size).toBe(1);
    });

    it("포화는 ∞ 로 적는다 — 자리잡은 수가 실측 어디에도 없어 fmt 하나로 되짚힌다", () => {
        const v = computedAxisView(feed({ display: { suffix: "일", decimals: 0, signed: false }, values: [pt("09:00:00", 12), pt("09:10:00", 4, true)] }));
        expect(v.fmt(13)).toBe("∞");
        expect(v.fmt(12)).toBe("12일");
    });

    it("포화가 없으면 ∞ 가 안 나온다 — 아무 값도 포화로 오인되지 않게", () => {
        const v = computedAxisView(feed({ values: [pt("09:00:00", 12)] }));
        expect(v.fmt(13)).toBe("+13.0%");
    });

    it("전부 포화면 다 같은 칸(0) — 세울 실측 기준이 없다", () => {
        const v = computedAxisView(feed({ values: [pt("09:00:00", 5, true), pt("09:10:00", 400, true)] }));
        expect([...v.values.values()]).toEqual([0, 0]);
        expect(v.fmt(0)).toBe("∞");
    });
});

describe("정렬 스냅 색인 — nearestPointAt 의 이분 탐색판(레일 드래그용)", () => {
    /** 무작위스러운 값 지도 — 답 대조는 선형판(nearestPointAt)이 한다(같은 함수 둘이면 같은 버그도 둘). */
    const values = new Map<string, number>(
        Array.from({ length: 97 }, (_, i) => [`p${i}`, Math.sin(i * 7.13) * 40 + (i % 5)] as const),
    );

    (["higher", "lower"] as const).forEach((sw) => {
        it(`선형판과 같은 자리를 짚는다(strongerWhen=${sw}) — 동률 키는 달라도 값이 같다`, () => {
            const domain = valueDomain(values)!;
            const idx = buildFracIndex(values, domain, sw);
            for (let f = 0; f <= 1.0001; f += 0.037) {
                const fast = nearestPointInIndex(f, idx);
                const slow = nearestPointAt(f, values, domain, sw);
                expect(fast).not.toBeNull();
                expect(values.get(fast!)).toBe(values.get(slow!));
            }
        });
    });

    it("빈 색인만 null — 값이 하나면 어디를 짚어도 그 타점", () => {
        expect(nearestPointInIndex(0.5, buildFracIndex(new Map(), { min: 0, max: 1 }, "higher"))).toBeNull();
        const one = new Map([["only", 3]]);
        const idx = buildFracIndex(one, valueDomain(one)!, "higher");
        expect(nearestPointInIndex(0, idx)).toBe("only");
        expect(nearestPointInIndex(1, idx)).toBe("only");
    });
});

describe("valueToFrac — log 척도(시총류: 수만 배 값 갈림)", () => {
    const domain = { min: 1, max: 10_000 };

    it("십진 로그 좌표 — 기하 가운데(100)가 0.5 에 선다(선형이면 0.01 로 뭉개진다)", () => {
        expect(valueToFrac(100, domain, "higher", "log")).toBeCloseTo(0.5, 10);
        expect(valueToFrac(1, domain, "higher", "log")).toBe(0);
        expect(valueToFrac(10_000, domain, "higher", "log")).toBe(1);
        expect(valueToFrac(100, domain, "lower", "log")).toBeCloseTo(0.5, 10); // 방향 뒤집기는 그대로 동작
    });

    it("스냅 색인·선형판이 같은 로그 좌표를 쓴다 — 한쪽만 선형이면 드래그가 엉뚱한 타점에 붙는다", () => {
        const values = new Map([["a", 1], ["b", 100], ["c", 10_000]]);
        const idx = buildFracIndex(values, domain, "higher", "log");
        expect(nearestPointInIndex(0.45, idx)).toBe("b"); // 선형 좌표라면 b(0.01)가 아니라 c 쪽이 잡힌다
        expect(nearestPointAt(0.45, values, domain, "higher", "log")).toBe("b");
    });

    it("도메인에 0 이하가 섞이면 선형 폴백 — 로그 정의역 밖에서 NaN 을 만들지 않는다", () => {
        expect(valueToFrac(50, { min: 0, max: 100 }, "higher", "log")).toBe(0.5);
    });

    it("축 정의의 display.scale 이 뷰로 노출된다", () => {
        const v = computedAxisView(feed({ display: { suffix: "억", decimals: 0, signed: false, scale: "log" } }));
        expect(v.scale).toBe("log");
        expect(computedAxisView(feed()).scale).toBeUndefined();
    });
});
