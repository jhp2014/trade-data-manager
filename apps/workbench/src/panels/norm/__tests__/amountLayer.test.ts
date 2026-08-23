// 거래대금 조회기 — 골격선 굵기·테마선 굵기·판독 칩이 **나눠 쓰는 공용 재료**.
//
// 셋이 같은 자를 쓴다는 게 이 파일의 요점이다: 값이 갈리면 같은 화면에서 굵기와 숫자가 다른 말을 한다.
// 그리고 "없음"의 처리가 규약이다 — 그날 유니버스 밖 종목은 **0이 아니라 없음**이고, 0으로 지어내면
// "거래가 없었다"와 "모른다"가 한 모양이 된다.
import { describe, it, expect } from "vitest";
import { minuteOfDayOf } from "@trade-data-manager/market/domain";
import type { DayReplay } from "@trade-data-manager/wire";
import { amountLevelOf, amountLookupOf, runWidth } from "../amountLayer.js";
import { LEVEL_MISSING } from "../../canvas/amountRuns.js";

/** 벽시계 분 → unix 초(overlayFixture 와 같은 식). */
const unixAtMinute = (m: number): number => Date.UTC(2026, 6, 8) / 1000 + m * 60 - 32400;

const stock = (code: string, minutes: number[], cum: number[]): DayReplay["stocks"][number] => ({
    code, name: code, market: "KRX", marketCap: "1000000000000", themes: [],
    times: minutes.map(unixAtMinute),
    rate: minutes.map(() => 0),
    high: minutes.map(() => 0), low: minutes.map(() => 0), open: 0,
    cumAmount: cum,
    minuteOpen: minutes.map(() => 0), minuteHigh: minutes.map(() => 0), minuteLow: minutes.map(() => 0),
    trailingHighs: { krx: minutes.map(() => 0), un: minutes.map(() => 0) },
    basePrice: { krx: 10_000, un: 10_000 },
});

const snapshot: DayReplay = {
    date: "2026-07-08",
    // 570~572분, 누적 10억 → 30억 → 34억(분당 10억 · 20억 · 4억)
    stocks: [stock("005930", [570, 571, 572], [1e9, 3e9, 3.4e9])],
};

describe("amountLookupOf — 분당/누적 조회기", () => {
    it("픽스처 자신 — 시각이 의도한 분에 놓였다", () => {
        expect(snapshot.stocks[0].times.map(minuteOfDayOf)).toEqual([570, 571, 572]);
    });

    it("분당 거래대금 = 누적의 차분", () => {
        const at = amountLookupOf(snapshot).amountAt("005930")!;
        expect(at(571)).toBeCloseTo(2e9);
        expect(at(572)).toBeCloseTo(0.4e9);
    });

    it("누적은 그 시각까지의 값 그대로 — 판독 칩을 뽑는 기준", () => {
        const cum = amountLookupOf(snapshot).cumAt("005930")!;
        expect(cum(570)).toBe(1e9);
        expect(cum(572)).toBe(3.4e9);
    });

    it("그날 유니버스 밖 종목은 **없음** — 0으로 지어내지 않는다", () => {
        const lookup = amountLookupOf(snapshot);
        expect(lookup.amountAt("999999")).toBeNull();
        expect(lookup.cumAt("999999")).toBeNull();
    });

    it("있는 종목이라도 없는 분은 없음 — 장 시작 전/거래 없는 분", () => {
        const at = amountLookupOf(snapshot).amountAt("005930")!;
        expect(at(400)).toBeNull();
        expect(at(600)).toBeNull();
    });

    it("스냅샷이 없으면 전부 없음 — 아직 안 받은 상태가 0으로 읽히면 안 된다", () => {
        const lookup = amountLookupOf(undefined);
        expect(lookup.amountAt("005930")).toBeNull();
        expect(lookup.cumAt("005930")).toBeNull();
    });

    // ⚠ 캐시가 **null 도 기억한다**(`get(code) !== undefined` 로 판정). `!hit` 로 바꾸면 유니버스 밖
    //   종목을 물을 때마다 stocks 를 처음부터 다시 훑는다 — 조용한 성능 회귀라 눈으로는 안 잡힌다.
    it("같은 종목을 다시 물으면 **같은 함수**를 준다 — 색인을 두 번 짓지 않는다", () => {
        const lookup = amountLookupOf(snapshot);
        expect(lookup.amountAt("005930")).toBe(lookup.amountAt("005930"));
        expect(lookup.cumAt("005930")).toBe(lookup.cumAt("005930"));
    });

    it("**없음도 캐시된다** — 유니버스 밖을 물을 때마다 전체를 다시 훑지 않게", () => {
        let scanned = 0;
        const counting = {
            ...snapshot,
            get stocks(): DayReplay["stocks"] { scanned++; return snapshot.stocks; },
        } as DayReplay;
        const lookup = amountLookupOf(counting);
        lookup.amountAt("999999");
        const afterFirst = scanned;
        lookup.amountAt("999999");
        expect(scanned).toBe(afterFirst); // 두 번째는 안 훑는다
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

    it("배수는 그대로 곱해진다 — 테마 선이 같은 척도를 얇게 쓴다", () => {
        expect(runWidth(1, 2)).toBeCloseTo(runWidth(1, 1) * 2);
    });
});
