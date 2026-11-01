import { describe, expect, it } from "vitest";
import { findStateTokens, lineDates, linePcts, formatState, lineRef, parseStateToken, toggleLine, type DailyLine } from "./stateToken.js";
import { priceLines, zonesOf } from "../chart/stateCopy.js";
import type { DailyCandle } from "../market/types.js";

const bar = (o: number, h: number, l: number, c: number) => ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: "0", amount: "0" });
const candle = (date: string, un: number[], krx = un): DailyCandle => ({ stockCode: "402340", date, un: bar(un[0], un[1], un[2], un[3]), krx: bar(krx[0], krx[1], krx[2], krx[3]) });
const daily = [candle("2026-07-01", [100, 130, 95, 120]), candle("2026-07-10", [125, 140, 120, 135]), candle("2026-07-15", [120, 150, 110, 140], [120, 148, 110, 140])];
const H0701: DailyLine = { date: "2026-07-01", field: "H", venue: "un" };
const H0710: DailyLine = { date: "2026-07-10", field: "H", venue: "un" };
const H0715: DailyLine = { date: "2026-07-15", field: "H", venue: "un" };

describe("선 이름", () => {
    it("yymmdd + OHLC, KRX 만 표시", () => {
        expect(lineRef(H0715)).toBe("260715H");
        expect(lineRef({ ...H0715, venue: "krx" })).toBe("260715H:KRX");
    });
    it("같은 선은 지우고, 넷째는 먼저 그은 것을 밀어낸다", () => {
        expect(toggleLine([H0701, H0715], H0715)).toEqual([H0701]);
        expect(toggleLine([H0701, H0715], H0710)).toEqual([H0701, H0715, H0710]);
        const fourth: DailyLine = { date: "2026-07-15", field: "L", venue: "un" };
        expect(toggleLine([H0701, H0715, H0710], fourth)).toEqual([H0715, H0710, fourth]);
    });
});

describe("구간 → 토큰", () => {
    const sorted = priceLines(daily, [H0715, H0701]); // 130(7/1) < 150(7/15)
    it("선 둘 = 구간 셋, 가격 높은 구간부터, 선은 낮은 것부터 적는다", () => {
        expect(zonesOf("402340", "2026-07-31", sorted).map((z) => z.token)).toEqual([
            "402340@2026-07-31@260701H▲@260715H▲",
            "402340@2026-07-31@260701H▲@260715H▼",
            "402340@2026-07-31@260701H▼@260715H▼",
        ]);
    });
    it("선 셋 = 구간 넷, 구간 경계는 맞닿은 두 선", () => {
        const zones = zonesOf("402340", "2026-07-31", priceLines(daily, [H0715, H0701, H0710])); // 130 < 140 < 150
        expect(zones.map((z) => z.token)).toEqual([
            "402340@2026-07-31@260701H▲@260710H▲@260715H▲",
            "402340@2026-07-31@260701H▲@260710H▲@260715H▼",
            "402340@2026-07-31@260701H▲@260710H▼@260715H▼",
            "402340@2026-07-31@260701H▼@260710H▼@260715H▼",
        ]);
        expect(zones[1].label).toBe("140 ~ 150 사이");
    });
    it("선의 시장 값으로 가격을 읽는다", () => {
        expect(priceLines(daily, [{ ...H0715, venue: "krx" }])[0].price).toBe(148);
    });
    it("선이 없으면 종목@날짜", () => {
        expect(zonesOf("402340", "2026-07-31", [])).toEqual([{ k: 0, label: "선 없음", token: "402340@2026-07-31" }]);
        expect(formatState("402340", "2026-07-31", [], 0)).toBe("402340@2026-07-31");
    });
});

describe("토큰 읽기", () => {
    it("글 속 첫 토큰을 읽고 구간(▲ 수)을 센다", () => {
        expect(parseStateToken("비교: `402340@2026-07-31@260701H▲@260715H:KRX▼` vs 009150@2026-07-31")).toEqual({
            code: "402340",
            date: "2026-07-31",
            time: null,
            lines: [H0701, { ...H0715, venue: "krx" }],
            zone: 1,
        });
    });
    it("종목@날짜 · 시각 붙은 꼴", () => {
        expect(parseStateToken("402340@2026-07-31")).toMatchObject({ lines: [], time: null });
        expect(parseStateToken("402340@2026-07-31 09:44")).toMatchObject({ time: "09:44" });
        expect(parseStateToken("402340@2026-07-31T09:44")).toMatchObject({ time: "09:44" });
    });
    it("틀린 꼴은 null — 선 봉이 상태 날짜와 같거나 뒤, 선 표기 오류, 토큰 없음", () => {
        expect(parseStateToken("402340@2026-07-31@260731H▲")).toBeNull();
        expect(parseStateToken("402340@2026-07-31@260715X▲")).toBeNull();
        expect(parseStateToken("아무 글")).toBeNull();
    });
    it("괄호·굵게·조사에 붙은 토큰도 읽는다", () => {
        for (const t of ["(402340@2026-07-31@260715H▲)", "**402340@2026-07-31@260715H▲**", "402340@2026-07-31@260715H▲와 비교", "402340@2026-07-31@260715H▲."])
            expect(parseStateToken(t)).toMatchObject({ code: "402340", lines: [H0715], zone: 1 });
    });
    it("선 셋까지 읽는다 — 구간 = ▲ 수", () => {
        expect(parseStateToken("402340@2026-07-31@260701H▲@260710H▲@260715H▼")).toMatchObject({ lines: [H0701, H0710, H0715], zone: 2 });
    });
    it("선 넷 · ▼ 다음 ▲ 는 토큰째 거절", () => {
        expect(parseStateToken("402340@2026-07-31@260701H▲@260705H▲@260710H▲@260715H▼")).toBeNull();
        expect(parseStateToken("402340@2026-07-31@260701H▼@260715H▲")).toBeNull();
        expect(parseStateToken("402340@2026-07-31@260701H▲@260710H▼@260715H▲")).toBeNull();
    });
    it("같은 선이 두 번이면 거절 — 시장이 다르면 다른 선", () => {
        expect(parseStateToken("402340@2026-07-31@260701H▲@260701H▼")).toBeNull();
        expect(parseStateToken("402340@2026-07-31@260701H▲@260701H:KRX▼")).toMatchObject({ zone: 1 });
    });
    it("복사한 토큰을 다시 읽으면 같은 선·구간", () => {
        const z = zonesOf("402340", "2026-07-31", priceLines(daily, [H0701, H0715]))[1];
        expect(parseStateToken(z.token)).toMatchObject({ lines: [H0701, H0715], zone: z.k });
        for (const z3 of zonesOf("402340", "2026-07-31", priceLines(daily, [H0715, H0701, H0710])))
            expect(parseStateToken(z3.token)).toMatchObject({ lines: [H0701, H0710, H0715], zone: z3.k });
    });
});

describe("통합 선은 UN* 값", () => {
    it("unFix 가 있으면 통합 선 가격은 보정값, KRX 선은 그대로", () => {
        const fixed = [{ ...daily[2], unFix: { high: "145" } }];
        expect(priceLines(fixed, [H0715])[0].price).toBe(145);
        expect(priceLines(fixed, [{ ...H0715, venue: "krx" }])[0].price).toBe(148);
    });
});

describe("글 속 토큰 전부", () => {
    it("글 속 순서대로, 적힌 글자 그대로 뽑는다 — 시각 꼴·선 없는 꼴도", () => {
        const text = "초안: `402340@2026-07-31@260701H▲@260715H▼` 고친 것 **402340@2026-07-31@260701H▲@260715H▲** 그리고 009150@2026-07-31 09:44, 005930@2026-07-01.";
        expect(findStateTokens(text).map((f) => f.token)).toEqual([
            "402340@2026-07-31@260701H▲@260715H▼",
            "402340@2026-07-31@260701H▲@260715H▲",
            "009150@2026-07-31 09:44",
            "005930@2026-07-01",
        ]);
        expect(findStateTokens(text)[0].state).toEqual(parseStateToken("402340@2026-07-31@260701H▲@260715H▼"));
    });
    it("틀린 꼴은 건너뛰고 나머지를 읽는다 — 선 넷 · ▼ 뒤 ▲ · 같은 선 두 번 · 표기 오류", () => {
        const bad = [
            "402340@2026-07-31@260701H▲@260705H▲@260710H▲@260715H▼",
            "402340@2026-07-31@260701H▼@260715H▲",
            "402340@2026-07-31@260701H▲@260701H▼",
            "402340@2026-07-31@260715X▲",
        ];
        expect(findStateTokens([...bad, "009150@2026-07-31@260715L▼"].join("\n")).map((f) => f.token)).toEqual(["009150@2026-07-31@260715L▼"]);
        expect(findStateTokens("아무 글")).toEqual([]);
    });
});

describe("선을 날짜로", () => {
    const say = (t: string, days?: string[]) => lineDates(parseStateToken(t)!, days && new Map(days.map((d, i) => [d, i])));
    const days = ["2026-07-01", "2026-07-02", "2026-07-10", "2026-07-15", "2026-07-30", "2026-07-31"];
    it("먼 것부터 날짜(거래일 수) — 구간은 말하지 않는다", () => {
        expect(say("402340@2026-07-31@260701H▲@260715H▲@260710H▼", days)).toBe("26/07/01(5) · 26/07/10(3) · 26/07/15(2)");
    });
    it("고가·통합이 아니면 값·시장을 덧붙이고, 달력에 없으면 거래일 수를 뺀다", () => {
        expect(say("402340@2026-07-31@260701H▼@260715L:KRX▼", days)).toBe("26/07/01(5) · 26/07/15(2) 저가 KRX");
        expect(say("402340@2026-07-31@251203H▼", days)).toBe("25/12/03");
        expect(say("402340@2026-07-31@260715H▼")).toBe("26/07/15");
    });
    it("% 는 늘 UN* 전날 종가 기준 — KRX 선도 그 가격을 UN 기준에 댄다, 받은 일봉에 없는 선은 빠진다", () => {
        const t = parseStateToken("402340@2026-07-31@260701H▼@260715H:KRX▼@250101H▼")!; // 전날 = 7/15 종가 140
        const pcts = linePcts(daily, t);
        expect(lineDates(t, undefined, pcts)).toBe("25/01/01 · 26/07/01(-7.1%) · 26/07/15(+5.7%) KRX"); // 130 · KRX 148
        expect(lineDates(t, new Map(["2026-07-01", "2026-07-15", "2026-07-31"].map((d, i) => [d, i])), pcts)).toBe("25/01/01 · 26/07/01(2, -7.1%) · 26/07/15(1, +5.7%) KRX");
        const fixed = [daily[0], daily[1], { ...daily[2], unFix: { high: "145" } }];
        expect(linePcts(fixed, parseStateToken("402340@2026-07-31@260715H▼")!).get("260715H")?.toFixed(1)).toBe("3.6"); // UN* 고가 145
    });
    it("선 없음 · 시각 꼴", () => {
        expect(say("402340@2026-07-31")).toBe("선 없음");
        expect(say("402340@2026-07-31 09:44")).toBe("09:44");
    });
});
