import { describe, expect, it } from "vitest";
import { formatState, lineRef, parseStateToken, toggleLine, type DailyLine } from "./stateToken.js";
import { priceLines, zonesOf } from "../chart/stateCopy.js";
import type { DailyCandle } from "../market/types.js";

const bar = (o: number, h: number, l: number, c: number) => ({ open: String(o), high: String(h), low: String(l), close: String(c), volume: "0", amount: "0" });
const candle = (date: string, un: number[], krx = un): DailyCandle => ({ stockCode: "402340", date, un: bar(un[0], un[1], un[2], un[3]), krx: bar(krx[0], krx[1], krx[2], krx[3]) });
const daily = [candle("2026-07-01", [100, 130, 95, 120]), candle("2026-07-15", [120, 150, 110, 140], [120, 148, 110, 140])];
const H0701: DailyLine = { date: "2026-07-01", field: "H", venue: "un" };
const H0715: DailyLine = { date: "2026-07-15", field: "H", venue: "un" };

describe("선 이름", () => {
    it("yymmdd + OHLC, KRX 만 표시", () => {
        expect(lineRef(H0715)).toBe("260715H");
        expect(lineRef({ ...H0715, venue: "krx" })).toBe("260715H:KRX");
    });
    it("같은 선은 지우고, 셋째는 먼저 그은 것을 밀어낸다", () => {
        expect(toggleLine([H0701, H0715], H0715)).toEqual([H0701]);
        const third: DailyLine = { date: "2026-07-15", field: "L", venue: "un" };
        expect(toggleLine([H0701, H0715], third)).toEqual([H0715, third]);
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
    it("선 셋 · ▼ 다음 ▲ 는 토큰째 거절", () => {
        expect(parseStateToken("402340@2026-07-31@260701H▲@260710H▲@260715H▼")).toBeNull();
        expect(parseStateToken("402340@2026-07-31@260701H▼@260715H▲")).toBeNull();
    });
    it("복사한 토큰을 다시 읽으면 같은 선·구간", () => {
        const z = zonesOf("402340", "2026-07-31", priceLines(daily, [H0701, H0715]))[1];
        expect(parseStateToken(z.token)).toMatchObject({ lines: [H0701, H0715], zone: z.k });
    });
});

describe("통합 선은 UN* 값", () => {
    it("unFix 가 있으면 통합 선 가격은 보정값, KRX 선은 그대로", () => {
        const fixed = [{ ...daily[1], unFix: { high: "145" } }];
        expect(priceLines(fixed, [H0715])[0].price).toBe(145);
        expect(priceLines(fixed, [{ ...H0715, venue: "krx" }])[0].price).toBe(148);
    });
});
