import { describe, it, expect } from "vitest";
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { groupByChart, monthBuckets, monthLabel, monthOf, sortItems } from "../resultRows.js";

const p = (date: string, stockCode: string, time?: string): FunnelItem => ({ stockCode, date, ...(time ? { time } : {}) });

describe("정렬 — 최근 날짜 먼저, 같은 차트는 시각순", () => {
    it("날짜는 내림차순", () => {
        const out = sortItems([p("2026-05-02", "A"), p("2026-07-11", "A"), p("2026-06-01", "A")]);
        expect(out.map((i) => i.date)).toEqual(["2026-07-11", "2026-06-01", "2026-05-02"]);
    });

    it("같은 날짜는 종목코드 오름차순 — 이름은 늦게 오므로 기준이 될 수 없다", () => {
        const out = sortItems([p("2026-07-11", "005930"), p("2026-07-11", "000660")]);
        expect(out.map((i) => i.stockCode)).toEqual(["000660", "005930"]);
    });

    it("같은 차트 안은 시각 오름차순", () => {
        const out = sortItems([p("2026-07-11", "A", "13:20:00"), p("2026-07-11", "A", "09:32:00")]);
        expect(out.map((i) => i.time)).toEqual(["09:32:00", "13:20:00"]);
    });

    it("원본을 건드리지 않는다", () => {
        const src = [p("2026-05-02", "A"), p("2026-07-11", "A")];
        sortItems(src);
        expect(src[0]!.date).toBe("2026-05-02");
    });
});

describe("monthBuckets — 달이 페이지", () => {
    it("등장 순서(최근 달 먼저)와 달별 건수", () => {
        const { months, countByMonth } = monthBuckets(sortItems([
            p("2026-07-11", "A"), p("2026-07-02", "B"), p("2026-05-30", "C"),
        ]));
        expect(months).toEqual(["2026-07", "2026-05"]);
        expect(countByMonth.get("2026-07")).toBe(2);
        expect(countByMonth.get("2026-05")).toBe(1);
    });

    it("빈 목록은 달도 없다", () => {
        expect(monthBuckets([]).months).toEqual([]);
    });

    it("표기는 두 자리 연도", () => {
        expect(monthOf("2026-07-11")).toBe("2026-07");
        expect(monthLabel("2026-07")).toBe("26.07");
    });
});

describe("groupByChart — 같은 (날짜·종목)은 한 덩어리", () => {
    it("정렬된 목록에서 붙어 있는 같은 차트를 묶는다", () => {
        const groups = groupByChart(sortItems([
            p("2026-07-11", "A", "09:32:00"), p("2026-07-11", "A", "10:05:00"), p("2026-07-11", "B", "09:40:00"),
        ]));
        expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
        expect(groups[0]!.stockCode).toBe("A");
        expect(groups[0]!.items.map((i) => i.time)).toEqual(["09:32:00", "10:05:00"]);
    });

    it("같은 종목이라도 날짜가 다르면 다른 덩어리", () => {
        const groups = groupByChart(sortItems([p("2026-07-11", "A", "09:32:00"), p("2026-07-10", "A", "09:32:00")]));
        expect(groups).toHaveLength(2);
    });

    it("하루 해상도(시각 없음)는 덩어리마다 한 항목", () => {
        const groups = groupByChart(sortItems([p("2026-07-11", "A"), p("2026-07-10", "A")]));
        expect(groups.map((g) => g.items.length)).toEqual([1, 1]);
    });

    it("빈 목록은 덩어리도 없다", () => {
        expect(groupByChart([])).toEqual([]);
    });
});
