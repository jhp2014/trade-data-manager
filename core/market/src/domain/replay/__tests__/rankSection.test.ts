import { describe, it, expect } from "vitest";
import { descendingOrdinals, lastIndexAtOrBefore, rankSectionOf, sectionValuesOf, windowedAmounts } from "../rankSection.js";
import { kstToUnix } from "../../kst.js";

describe("lastIndexAtOrBefore — t 이하 마지막 인덱스(carry-forward 의 심장)", () => {
    const times = [100, 200, 300];

    it("경계: 첫 원소 미만 = -1 / 정확 일치 = 그 인덱스 / 마지막 초과 = 마지막", () => {
        expect(lastIndexAtOrBefore(times, 99)).toBe(-1);
        expect(lastIndexAtOrBefore(times, 100)).toBe(0);
        expect(lastIndexAtOrBefore(times, 250)).toBe(1);
        expect(lastIndexAtOrBefore(times, 999)).toBe(2);
        expect(lastIndexAtOrBefore([], 1)).toBe(-1);
    });
});

describe("descendingOrdinals — 경쟁 순위(1,1,3), 결손은 분모 제외", () => {
    it("내림차순 1-base, 입력 순서 보존", () => {
        expect(descendingOrdinals([5, 20, 10])).toEqual([3, 1, 2]);
    });

    it("동점은 같은 서수, 다음 서수는 건너뛴다 — 코드 사전순 따위로 억지로 가르지 않는다", () => {
        expect(descendingOrdinals([10, 10, 5, 10])).toEqual([1, 1, 4, 1]);
        expect(descendingOrdinals([10, 10, 5])).toEqual([1, 1, 3]);
    });

    it("null·비유한값은 서수도 null — 다른 값의 서수를 밀지 않는다", () => {
        expect(descendingOrdinals([null, 20, NaN, 10])).toEqual([null, 1, null, 2]);
    });

    it("전부 결손 / 빈 배열", () => {
        expect(descendingOrdinals([null, null])).toEqual([null, null]);
        expect(descendingOrdinals([])).toEqual([]);
    });
});

describe("rankSectionOf — (날짜,분) 단면", () => {
    const DATE = "2026-08-14";
    const at = (time: string): number => kstToUnix(DATE, time);
    /** 분당 봉: [시각 "HH:MM:SS", rate%, cumAmount] 목록으로 종목 하나. */
    const stock = (code: string, bars: [string, number, number][]): { code: string; times: number[]; rate: number[]; cumAmount: number[] } => ({
        code,
        times: bars.map(([tm]) => at(tm)),
        rate: bars.map(([, r]) => r),
        cumAmount: bars.map(([, , a]) => a),
    });

    const A = stock("A", [["09:00:00", 1, 100], ["09:10:00", 5, 300]]);
    const B = stock("B", [["09:05:00", 9, 50], ["09:10:00", 2, 900]]); // 늦게 시작

    it("아직 시작 전인 종목은 결손 — 분모(n)가 준다", () => {
        const s = rankSectionOf([A, B], DATE, "09:00");
        expect(s.n).toBe(1);
        expect(s.rate).toEqual([1, null]);
        expect(s.amount).toEqual([1, null]);
    });

    it("carry-forward — 그 분에 봉이 없어도 이전 데이터가 있으면 마지막 값으로 참가한다(정지 종목이 분모에서 안 빠진다)", () => {
        const s = rankSectionOf([A, B], DATE, "09:07");
        // A 는 09:00 값(1%, 100), B 는 09:05 값(9%, 50)으로 참가.
        expect(s.n).toBe(2);
        expect(s.rate).toEqual([2, 1]);
        expect(s.amount).toEqual([1, 2]);
    });

    it("등락률 서수와 거래대금 서수는 독립이다", () => {
        const s = rankSectionOf([A, B], DATE, "09:10");
        // rate: A 5% > B 2% → [1,2]. amount: B 900 > A 300 → [2,1].
        expect(s.rate).toEqual([1, 2]);
        expect(s.amount).toEqual([2, 1]);
        expect(s.n).toBe(2);
    });

    it("장 종료 뒤 시각도 carry-forward 로 마지막 값이 유지된다", () => {
        const s = rankSectionOf([A, B], DATE, "15:40");
        expect(s.n).toBe(2);
        expect(s.rate).toEqual([1, 2]);
    });

    it("초가 섞인 시각(HH:MM:SS)도 분으로 절단해 같은 단면을 낸다 — NaN 으로 새면 전부 결손인 '정상 모양의 틀린 단면'이 된다", () => {
        const withSec = rankSectionOf([A, B], DATE, "09:07:45");
        const bare = rankSectionOf([A, B], DATE, "09:07");
        expect(withSec).toEqual(bare);
        expect(withSec.time).toBe("09:07");
        expect(withSec.n).toBe(2); // NaN 회귀 시 0 이 된다
    });

    it("time 은 그 분 자체가 경계다 — HH:MM:00 시각의 봉까지 포함한다", () => {
        const C = stock("C", [["09:00:00", 3, 10]]); // 내내 3%
        // 09:09: A 는 09:00 값(1%) < C 3% → A 가 2위. 09:10: A 의 09:10 봉(5%)이 포함돼 1위로 뒤집힌다.
        expect(rankSectionOf([A, C], DATE, "09:09").rate).toEqual([2, 1]);
        expect(rankSectionOf([A, C], DATE, "09:10").rate).toEqual([1, 2]);
    });

    it("amount60 — 60분 창 대금 서수가 당일 누적 서수와 독립으로 선다(오후 급증주가 창에서 앞선다)", () => {
        // 10:31 기준: D 는 아침에만(총 1000, 창 안 0) · E 는 방금 대량(총 900, 창 안 900).
        const D = stock("D", [["09:00:00", 1, 1000]]);
        const E = stock("E", [["09:00:00", 1, 50], ["10:30:00", 1, 900]]);
        const s = rankSectionOf([D, E], DATE, "10:31");
        expect(s.amount).toEqual([1, 2]); // 당일 누적: D 1000 > E 900
        expect(s.amount60).toEqual([2, 1]); // 60분 창: D 0 < E 850
    });

    it("sectionValuesOf — 서수 단면과 같은 carry-forward·절단 규칙의 원값 층", () => {
        const v = rankSectionOf([A, B], DATE, "09:07");
        const vals = sectionValuesOf([A, B], DATE, "09:07:30");
        expect(vals.time).toBe("09:07");
        expect(vals.rate).toEqual([1, 9]); // A 09:00 봉 / B 09:05 봉
        expect(vals.cumAmount).toEqual([100, 50]);
        // 서수 단면은 이 값의 내림차순이다 — 두 층이 한 벌임을 고정.
        expect(v.rate).toEqual(descendingOrdinals(vals.rate));
    });
});

describe("windowedAmounts — T-창 누적 거래대금(경계 = 0 기준)", () => {
    const DATE = "2026-08-14";
    const at = (time: string): number => kstToUnix(DATE, time);
    const stock = (code: string, bars: [string, number][]): { code: string; times: number[]; rate: number[]; cumAmount: number[] } => ({
        code,
        times: bars.map(([tm]) => at(tm)),
        rate: bars.map(() => 0),
        cumAmount: bars.map(([, a]) => a),
    });

    // 분당 누적: 09:00=100 · 09:30=400 · 10:30=1000
    const A = stock("A", [["09:00:00", 100], ["09:30:00", 400], ["10:30:00", 1000]]);

    it("창 안 = cum[t] − cum[t−T] (창 = (t−T, t] — t−T 정각 봉은 창 밖)", () => {
        // 10:30, T=60: t−T=09:30 → 그 봉(400)까지가 밖. 1000−400=600.
        expect(windowedAmounts([A], DATE, "10:30", 60)).toEqual([600]);
        // 10:29, T=60: t−T=09:29 → 09:00 봉(100)이 마지막 밖. carry-forward 로 지금 값은 09:30 봉(400). 400−100=300.
        expect(windowedAmounts([A], DATE, "10:29", 60)).toEqual([300]);
    });

    it("시작 경계 0 기준 — t−T 가 첫 봉보다 이르면 당일 누적 전체(장 초반이 결손이 되지 않는다)", () => {
        expect(windowedAmounts([A], DATE, "09:30", 60)).toEqual([400]);
        expect(windowedAmounts([A], DATE, "09:00", 60)).toEqual([100]);
    });

    it("결손(그 분 이전 데이터 없음)만 null — 거래 없는 창은 0(값이다)", () => {
        expect(windowedAmounts([A], DATE, "08:59", 60)).toEqual([null]);
        // 12:00, T=60: 창 (11:00,12:00] 에 봉 없음 — carry-forward 값 1000, t−T 이전 마지막도 1000 → 0.
        expect(windowedAmounts([A], DATE, "12:00", 60)).toEqual([0]);
    });

    it("당일 전체(창 밖 봉이 없는 T)와 창의 관계 — 큰 T 는 누적 전체로 수렴", () => {
        expect(windowedAmounts([A], DATE, "10:30", 600)).toEqual([1000]);
    });
});
