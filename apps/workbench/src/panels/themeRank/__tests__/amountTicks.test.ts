import { describe, expect, it } from "vitest";
import { descendingOrdinals } from "@trade-data-manager/market/domain";
import {
    amountTickLabelText,
    amountTickWindowKey,
    commitAmountTicks,
    fmtAmountTick,
    parseAmountInput,
    parseAmountTickList,
    parseAmountTicks,
    withWindowTicks,
} from "../amountTicks.js";
import { layoutThresholdTicks, thresholdCounts } from "../thresholdTicks.js";

describe("parseAmountTicks — 창별 저장물의 관대한 파서", () => {
    it("객체가 아니면 {} · 잘못된 키는 버림 · 빈 목록 항목도 버림(기본이 빈 목록이라 뜻이 같다)", () => {
        expect(parseAmountTicks(undefined)).toEqual({});
        expect(parseAmountTicks([1, 2])).toEqual({});
        expect(parseAmountTicks({ day: [300], "30": [100], "0": [5], "-5": [5], abc: [5], "1.5": [5], "60": [] }))
            .toEqual({ day: [300], "30": [100] });
    });
    it("목록 정규화 — 유한값·범위 안만, 소수 1자리(억), 중복 제거, 오름차순, 앞에서 8개", () => {
        expect(parseAmountTickList([500, "100", NaN, 100, 0.01, 200000, 1.23, 500.04])).toEqual([1.2, 100, 500]);
        expect(parseAmountTickList([9, 8, 7, 6, 5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
    it("커밋은 범위 밖을 끝으로 붙인다(조용히 버리지 않는다) — [1억, 10조]", () => {
        expect(commitAmountTicks([0.2, 300, 999999])).toEqual([1, 300, 100000]);
    });
    it("창키 — 당일 = day, N분 = N", () => {
        expect(amountTickWindowKey(null)).toBe("day");
        expect(amountTickWindowKey(30)).toBe("30");
    });
    it("withWindowTicks — 병합 쓰기, 빈 목록이면 키 삭제(다른 창은 보존)", () => {
        const all = { day: [300], "30": [100] };
        expect(withWindowTicks(all, "60", [50])).toEqual({ day: [300], "30": [100], "60": [50] });
        expect(withWindowTicks(all, "30", [])).toEqual({ day: [300] });
        expect(all).toEqual({ day: [300], "30": [100] }); // 원본 불변
    });
});

describe("parseAmountInput — 칩 글자(억 단위)", () => {
    it("맨숫자 = 억 · 단위 접미(억·조) · 쉼표 표기 수용 · 빈칸 = 삭제 · 0 이하·못 읽으면 null", () => {
        expect(parseAmountInput("300")).toBe(300);
        expect(parseAmountInput(" 300억 ")).toBe(300);
        expect(parseAmountInput("1.2조")).toBe(12000);
        expect(parseAmountInput("4,500억")).toBe(4500);
        expect(parseAmountInput("")).toBe("");
        expect(parseAmountInput("abc")).toBeNull();
        expect(parseAmountInput("0")).toBeNull();
        expect(parseAmountInput("-5")).toBeNull();
    });
});

describe("표기 — 억/조 접기", () => {
    it("fmtAmountTick — 10000억부터 조", () => {
        expect(fmtAmountTick(300)).toBe("300억");
        expect(fmtAmountTick(12000)).toBe("1.2조");
        expect(fmtAmountTick(10000)).toBe("1조");
    });
    it("amountTickLabelText — 같은 단위는 한 번만, 다르면 각자 · 셋 이상은 양끝만", () => {
        expect(amountTickLabelText([300, 500])).toBe("300·500억");
        expect(amountTickLabelText([5000, 12000])).toBe("5000억·1.2조");
        expect(amountTickLabelText([100, 300, 500])).toBe("100…500억");
        expect(amountTickLabelText([100, 300, 500], 1)).toBe("100…500억");
        expect(amountTickLabelText([300], 1)).toBe("300억");
    });
});

describe("셈 — count + 0.5 가 정확한 경계(대금 서수와 같은 배열)", () => {
    it("경쟁 순위와 맞물린다 — X원 이상은 전부 순위 ≤ count, 미만은 전부 > count", () => {
        const won = [5e10, 3e10, 3e10, 2.9e10, 1e9, null, 7e12];
        const ords = descendingOrdinals(won);
        for (const X억 of [1, 300, 10000, 100000]) {
            const [{ count }] = thresholdCounts(won, [Math.round(X억 * 1e8)]);
            won.forEach((v, i) => {
                if (v === null) return;
                if (v >= X억 * 1e8) expect(ords[i]!).toBeLessThanOrEqual(count);
                else expect(ords[i]!).toBeGreaterThan(count);
            });
        }
    });
});

describe("layoutThresholdTicks — x 반전축(1위 = 오른쪽)", () => {
    // 반전 스케일: 순위 v → px = 1000 − v (1위 쪽이 큰 px). 뷰 [x0, x1].
    const scale = (x0: number, x1: number) => ({ px: (v: number) => 1000 - v, inDomain: (v: number) => v >= x0 && v <= x1 });
    const EDGE = { loPx: 994, hiPx: 116 }; // lo(1위 쪽) = 오른쪽 가장자리

    it("도메인 lo 쪽(순위 작음 = 오른쪽)으로 벗어나면 beyondLo, 반대는 beyondHi", () => {
        const l = layoutThresholdTicks(
            [{ v: 1000, count: 2 }, { v: 300, count: 50 }, { v: 100, count: 900 }, { v: 9999, count: 0 }],
            scale(10, 200), 10, EDGE, 48,
        );
        expect(l.beyondLo).toEqual([1000]); // 2.5 < 10 — 1위 쪽(오른쪽) 밖
        expect(l.beyondHi).toEqual([100]); // 900.5 > 200 — 왼쪽 밖
        expect(l.lines).toEqual([{ v: 300, p: 1000 - 50.5 }]);
    });

    it("가장자리 글자가 서면 뷰 안 글자는 **px 반대 방향**으로 밀려 앉는다(선은 제자리)", () => {
        // 11.5 → px 988.5, lo 가장자리(994)에서 48 안 — 994−48 = 946 으로 밀린다.
        const l = layoutThresholdTicks(
            [{ v: 500, count: 2 }, { v: 300, count: 11 }],
            scale(10, 200), 10, EDGE, 48,
        );
        expect(l.beyondLo).toEqual([500]);
        expect(l.lines.map((x) => x.p)).toEqual([1000 - 11.5]);
        expect(l.labels).toEqual([{ p: 946, parts: [300] }]);
    });

    it("합침은 px 거리 기준 — 48px 안의 두 선은 한 묶음(작은 값부터)", () => {
        const l = layoutThresholdTicks(
            [{ v: 500, count: 20 }, { v: 300, count: 40 }, { v: 100, count: 150 }],
            scale(10, 200), 10, EDGE, 48,
        );
        // 20.5 → 979.5 · 40.5 → 959.5 (20px 간격 = 합침) · 150.5 → 849.5 (떨어짐)
        expect(l.labels.map((g) => g.parts)).toEqual([[300, 500], [100]]);
        expect(l.labels[0].p).toBeCloseTo((979.5 + 959.5) / 2);
    });

    it("hi 가장자리(왼쪽) 접힘이 서면 뷰 안 글자는 그 안쪽(px 큰 쪽)으로 밀린다", () => {
        // 180.5 → px 819.5 — hi 가장자리(790)에서 48 안 → 790+48 = 838 로 밀린다. 선은 제자리.
        const l = layoutThresholdTicks(
            [{ v: 300, count: 180 }, { v: 100, count: 900 }],
            scale(10, 200), 10, { loPx: 994, hiPx: 790 }, 48,
        );
        expect(l.beyondHi).toEqual([100]);
        expect(l.lines.map((x) => x.p)).toEqual([1000 - 180.5]);
        expect(l.labels).toEqual([{ p: 838, parts: [300] }]);
    });

    it("hiAlways — 접힘이 없어도 hi 가장자리(y 제목 예약) 밖의 글자를 안쪽으로 민다", () => {
        const edge = { loPx: 984, hiPx: 850, hiAlways: true as const };
        const on = layoutThresholdTicks([{ v: 100, count: 180 }], scale(10, 200), 10, edge, 48);
        expect(on.lines.map((x) => x.p)).toEqual([819.5]); // 선은 제자리
        expect(on.labels).toEqual([{ p: 850, parts: [100] }]); // 글자만 예약 경계로
        const off = layoutThresholdTicks([{ v: 100, count: 180 }], scale(10, 200), 10, { loPx: 984, hiPx: 850 }, 48);
        expect(off.labels).toEqual([{ p: 819.5, parts: [100] }]);
    });

    it("양쪽 접힘 동시 — 뷰 안 글자는 [hi+merge, lo−merge] 띠 안에 앉는다", () => {
        const l = layoutThresholdTicks(
            [{ v: 1000, count: 2 }, { v: 300, count: 195 }, { v: 100, count: 900 }],
            scale(10, 200), 10, { loPx: 994, hiPx: 790 }, 48,
        );
        expect(l.beyondLo).toEqual([1000]);
        expect(l.beyondHi).toEqual([100]);
        expect(l.labels).toEqual([{ p: 838, parts: [300] }]); // 804.5 → hi 쪽 밀림
    });
});
