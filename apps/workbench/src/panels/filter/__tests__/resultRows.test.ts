import { describe, it, expect } from "vitest";
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { flattenRows, monthBuckets, monthLabel, monthOf, sortItems } from "../resultRows.js";

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

describe("flattenRows — 문맥이 줄 안으로 들어온다", () => {
    // 왜 이 모양인가: 가상화가 목록을 중간에서 자르면 "덩어리의 몇 번째냐"를 바깥에서 못 읽는다.
    // 그래서 first(날짜·이름을 쓸지)와 tied(세로선을 그을지)를 만들 때 한 번 계산해 줄에 박는다.
    it("붙어 있는 같은 차트는 첫 줄만 first, 전부 tied", () => {
        const rows = flattenRows(sortItems([
            p("2026-07-11", "A", "09:32:00"), p("2026-07-11", "A", "10:05:00"), p("2026-07-11", "B", "09:40:00"),
        ]));
        expect(rows.map((r) => r.kind === "item" && r.first)).toEqual([true, false, true]);
        expect(rows.map((r) => r.kind === "item" && r.tied)).toEqual([true, true, false]);
    });

    it("같은 종목이라도 날짜가 다르면 다른 덩어리 — 둘 다 first, 둘 다 안 묶임", () => {
        const rows = flattenRows(sortItems([p("2026-07-11", "A", "09:32:00"), p("2026-07-10", "A", "09:32:00")]));
        expect(rows.map((r) => r.kind === "item" && r.first)).toEqual([true, true]);
        expect(rows.map((r) => r.kind === "item" && r.tied)).toEqual([false, false]);
    });

    it("하루 해상도(시각 없음)는 줄마다 제 덩어리", () => {
        const rows = flattenRows(sortItems([p("2026-07-11", "A"), p("2026-07-10", "A")]));
        expect(rows.map((r) => r.kind === "item" && r.first)).toEqual([true, true]);
    });

    it("키는 줄마다 다르다 — 한 차트의 타점 여럿이 같은 키를 쓰면 목록이 섞인다", () => {
        const rows = flattenRows(sortItems([p("2026-07-11", "A", "09:32:00"), p("2026-07-11", "A", "10:05:00")]));
        expect(new Set(rows.map((r) => r.key)).size).toBe(2);
    });

    it("빈 목록은 줄도 없다", () => {
        expect(flattenRows([])).toEqual([]);
    });
});
