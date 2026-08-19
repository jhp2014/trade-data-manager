import { describe, it, expect } from "vitest";
import type { ViewedSet } from "../useSetViews.js";
import { setMembersOf } from "../setMembers.js";

const view = (items: ViewedSet["viewedItems"], pointRefs: ViewedSet["viewedPointRefs"]): ViewedSet => ({
    isFiltering: true, broken: false, viewedItems: items,
    viewedChartKeys: new Set(items.map((i) => `${i.stockCode}|${i.date}`)),
    viewedPointRefs: pointRefs,
});

const A = "000001", B = "000002";
const D = "2026-07-01";

describe("setMembersOf — 패널 층위 변환 + 표현됨/안 됨", () => {
    it("day 패널: 투영(∃) — 타점이 접히고 pointCount 가 낱알을 병기한다", () => {
        const v = view(
            [{ stockCode: A, date: D, time: "09:30:00" }, { stockCode: A, date: D, time: "10:00:00" }, { stockCode: B, date: D }],
            [{ stockCode: A, date: D, time: "09:30:00" }, { stockCode: A, date: D, time: "10:00:00" }],
        );
        const m = setMembersOf(v, "day");
        expect(m.total).toBe(2);
        expect(m.members.find((x) => x.stockCode === A)?.pointCount).toBe(2); // 손실 병기
        expect(m.members.find((x) => x.stockCode === B)?.pointCount).toBe(0); // 원래 하루 — 손실 없음
        expect(m.okCount).toBe(2); // 술어 없음 = 전부 표현됨
    });

    it("point 패널: 전개(∀) — 타점 0인 하루는 시각 없는 행으로 '표현 안 됨'에 선다(조용한 소멸 금지)", () => {
        const v = view(
            [{ stockCode: A, date: D }, { stockCode: B, date: D }],
            [{ stockCode: A, date: D, time: "09:30:00" }], // B 는 타점이 없어 전개가 못 살렸다
        );
        const m = setMembersOf(v, "point", () => true);
        expect(m.total).toBe(2);
        const b = m.members.find((x) => x.stockCode === B)!;
        expect(b.time).toBeUndefined();
        expect(b.ok).toBe(false); // 술어가 참이어도 재료(타점)가 없으면 안 됨
        expect(m.okCount).toBe(1);
    });

    it("표현가능 술어가 안 됨을 가른다 — 결손 목록은 패널의 자기 고백이다", () => {
        const v = view(
            [{ stockCode: A, date: D }, { stockCode: B, date: D }],
            [],
        );
        const m = setMembersOf(v, "day", (it) => it.stockCode === A);
        expect(m.okCount).toBe(1);
        expect(m.members.find((x) => x.stockCode === B)?.ok).toBe(false);
    });
});
