// 테마 보드 계산 — workbench lib/boardViewModel.test.ts 의 복기 보드 경우에서 옮기고(필터·큐레이션·구간 카운트는 뺀 기능이라 제외),
// 사후 정보·카드 묶기를 더했다.
import { describe, expect, it } from "vitest";
import { buildThemeBoard, focusPlace } from "./viewModel.js";
import type { ReplayStock } from "../market/types.js";

const rstock = (code: string, over: Partial<ReplayStock>): ReplayStock => ({
    code,
    times: [100, 160],
    rate: [1, 5],
    high: [1, 6],
    low: [0, -1],
    open: 0,
    cumAmount: [10, 20],
    basePrice: { krx: null, un: null },
    name: code,
    market: "KOSPI",
    marketCap: null,
    themes: ["T"],
    ...over,
});
const indexOf = (...s: ReplayStock[]) => new Map(s.map((x) => [x.code, x]));
const codes = (b: ReturnType<typeof buildThemeBoard>) => b.stocks.map((s) => s.code);

describe("buildThemeBoard", () => {
    it("거래대금 상위 ∪ 등락률 상위만, 값은 그 시각의 것", () => {
        const idx = indexOf(rstock("A", { rate: [1, 9], cumAmount: [10, 100] }), rstock("B", { rate: [1, 2], cumAmount: [10, 20] }));
        // t=200 → times[1]=160 이 마지막 ≤200. 대금 1위·등락 1위 = A
        const b = buildThemeBoard(idx, 200, "un", { amountN: 1, rateN: 1 });
        expect(codes(b)).toEqual(["A"]);
        expect(b.stocks[0].changeRate).toBe(9);
    });

    it("사후 정보 없음 — 그 시각 이후의 분은 보지 않는다", () => {
        const idx = indexOf(rstock("A", { times: [100, 160, 220], rate: [1, 2, 25], high: [1, 2, 25], cumAmount: [10, 20, 900] }));
        const at160 = buildThemeBoard(idx, 170, "un", { amountN: 5, rateN: 5 });
        expect(at160.stocks[0]).toMatchObject({ changeRate: 2, highPct: 2, amount: 20 });
    });

    it("아직 첫 분이 안 온 종목은 빠진다", () => {
        const idx = indexOf(rstock("A", {}), rstock("LATE", { times: [500, 560] }));
        expect(codes(buildThemeBoard(idx, 200, "un", { amountN: 5, rateN: 5 }))).toEqual(["A"]);
    });

    it("KRX 기준 — 화면의 % 만 바꾸고(기준가 없으면 통합 그대로), 유니버스·주도주는 통합 잣대", () => {
        const idx = indexOf(
            rstock("A", { rate: [1, 5], high: [1, 6], cumAmount: [10, 100], basePrice: { krx: 98, un: 100 } }),
            rstock("B", { rate: [1, 5], cumAmount: [10, 90], basePrice: { krx: null, un: 100 } }),
        );
        const b = buildThemeBoard(idx, 200, "krx", { amountN: 5, rateN: 5 });
        const a = b.stocks.find((s) => s.code === "A");
        expect(a?.changeRate).toBe(7.14); // 100×105/98−100
        expect(a?.highPct).toBe(8.16);
        expect(a?.isMover).toBe(false); // 통합 5% 는 5% 초과가 아니다
        expect(b.stocks.find((s) => s.code === "B")?.changeRate).toBe(5);
    });

    it("1분 신호 — 직전 1분 등락률 +0.6%p 이상 그리고 거래대금 60억 이상", () => {
        const EOK = 1e8;
        const idx = indexOf(
            rstock("HOT", { times: [100, 160], rate: [3, 4], cumAmount: [0, 70 * EOK] }),
            rstock("SLOW", { times: [100, 160], rate: [3, 4], cumAmount: [0, 50 * EOK] }),
        );
        const b = buildThemeBoard(idx, 160, "un", { amountN: 5, rateN: 5 });
        expect(b.stocks.find((s) => s.code === "HOT")?.signal).not.toBeNull();
        expect(b.stocks.find((s) => s.code === "SLOW")?.signal).toBeNull();
    });

    it("카드 = 멤버 2개 이상 테마, 나머지는 개별·미분류. 포함관계는 parents", () => {
        const idx = indexOf(
            rstock("A", { themes: ["반도체", "HBM"], rate: [1, 9] }),
            rstock("B", { themes: ["반도체", "HBM"], rate: [1, 8] }),
            rstock("C", { themes: ["반도체"], rate: [1, 7] }),
            rstock("D", { themes: ["조선"], rate: [1, 6] }),
            rstock("E", { themes: [], rate: [1, 5] }),
        );
        const b = buildThemeBoard(idx, 200, "un", { amountN: 9, rateN: 9 });
        expect(b.grouped.themes.map((g) => [g.theme, g.stocks.map((s) => s.code)])).toEqual([
            ["반도체", ["A", "B", "C"]],
            ["HBM", ["A", "B"]],
        ]);
        expect(b.grouped.individuals.map((s) => s.code)).toEqual(["D"]);
        expect(b.grouped.unclassified.map((s) => s.code)).toEqual(["E"]);
        expect(b.parents.get("HBM")).toEqual(["반도체"]);
    });

});

describe("focusPlace", () => {
    // A·B = 테마 T 카드, C = 테마 U 하나뿐(개별), D = 테마 없음(미분류), Z = 유니버스 밖
    const idx = indexOf(rstock("A", {}), rstock("B", {}), rstock("C", { themes: ["U"] }), rstock("D", { themes: [] }));
    const { grouped } = buildThemeBoard(idx, 200, "un", { amountN: 10, rateN: 10 });
    it("테마 카드에 들었거나 종목이 없으면 null, 아니면 그 자리", () => {
        expect(focusPlace(grouped, "")).toBeNull();
        expect(focusPlace(grouped, "A")).toBeNull();
        expect(focusPlace(grouped, "C")).toBe("개별");
        expect(focusPlace(grouped, "D")).toBe("미분류");
        expect(focusPlace(grouped, "Z")).toBe("랭킹 밖");
    });
});
