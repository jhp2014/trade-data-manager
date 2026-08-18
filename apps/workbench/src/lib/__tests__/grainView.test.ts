import { describe, it, expect } from "vitest";
import type { FunnelItem } from "@trade-data-manager/market/domain";
import { expandToPointItems, projectToDayFolds } from "../grainView.js";

const times = new Map<string, string[]>([
    ["A|2026-07-01", ["09:30:00", "10:00:00"]],
    ["C|2026-07-03", ["11:00:00"]],
]);
const timesOf = (c: { stockCode: string; date: string }): readonly string[] => times.get(`${c.stockCode}|${c.date}`) ?? [];

describe("전개(day→point, ∀) — 무손실 내림", () => {
    it("하루 항목은 그날 타점 전부로 펼쳐진다", () => {
        const out = expandToPointItems([{ stockCode: "A", date: "2026-07-01" }], timesOf);
        expect(out.map((i) => i.time)).toEqual(["09:30:00", "10:00:00"]);
    });

    it("타점 0인 하루는 대표가 없다 — 사이드바의 '표현 안 됨'이 받을 결손", () => {
        expect(expandToPointItems([{ stockCode: "B", date: "2026-07-02" }], timesOf)).toEqual([]);
    });

    it("시각 있는 항목은 그대로 통과한다", () => {
        const it_: FunnelItem = { stockCode: "C", date: "2026-07-03", time: "11:00:00" };
        expect(expandToPointItems([it_], timesOf)).toEqual([it_]);
    });

    it("하루 전개와 타점 직접이 겹치면 하나로 접는다", () => {
        const out = expandToPointItems(
            [{ stockCode: "A", date: "2026-07-01" }, { stockCode: "A", date: "2026-07-01", time: "09:30:00" }],
            timesOf,
        );
        expect(out).toHaveLength(2); // 09:30 · 10:00 — 중복 없음
    });
});

describe("투영(point→day, ∃) — 손실 있는 올림이라 낱알 수를 병기한다", () => {
    it("타점들이 제 하루로 접히고 pointCount 가 낱알을 센다", () => {
        const out = projectToDayFolds([
            { stockCode: "A", date: "2026-07-01", time: "09:30:00" },
            { stockCode: "A", date: "2026-07-01", time: "10:00:00" },
            { stockCode: "C", date: "2026-07-03", time: "11:00:00" },
        ]);
        expect(out).toEqual([
            { stockCode: "A", date: "2026-07-01", pointCount: 2 },
            { stockCode: "C", date: "2026-07-03", pointCount: 1 },
        ]);
    });

    it("원래부터 하루 항목이면 pointCount 0 — 손실이 없었다는 표식", () => {
        expect(projectToDayFolds([{ stockCode: "B", date: "2026-07-02" }])).toEqual([
            { stockCode: "B", date: "2026-07-02", pointCount: 0 },
        ]);
    });

    it("첫 등장 순서를 지킨다 — 호출부의 정렬을 존중", () => {
        const out = projectToDayFolds([
            { stockCode: "C", date: "2026-07-03", time: "11:00:00" },
            { stockCode: "A", date: "2026-07-01", time: "09:30:00" },
        ]);
        expect(out.map((f) => f.stockCode)).toEqual(["C", "A"]);
    });
});
