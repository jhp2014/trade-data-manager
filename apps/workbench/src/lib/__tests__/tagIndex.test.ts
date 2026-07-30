import { describe, it, expect } from "vitest";
import type { TagAttachment } from "@trade-data-manager/wire";
import { applyTagToggle, buildTagIndex, countByTag } from "../tagIndex.js";

const P = { stockCode: "005930", date: "2026-06-30", time: "09:11:00" };
const Q = { stockCode: "000660", date: "2026-06-30", time: "10:00:00" };
// tagId → 이름: 낙관적 삽입이 서버와 같은 이름순을 유지하는지 보려고 일부러 id 순과 이름순을 어긋나게 둔다.
const NAMES: Record<string, string> = { t1: "다", t2: "가", t3: "나" };
const nameOf = (id: string): string => NAMES[id] ?? id;

const att = (): TagAttachment[] => [{ ...P, tagIds: ["t2", "t3"] }, { ...Q, tagIds: ["t1"] }];

describe("buildTagIndex / countByTag", () => {
    it("타점키로 접고, 태그별 건수를 센다", () => {
        const idx = buildTagIndex(att());
        expect(idx.get("005930|2026-06-30|09:11:00")).toEqual(["t2", "t3"]);
        expect(idx.get("없는|키|00:00:00")).toBeUndefined();

        const c = countByTag(att());
        expect(c.get("t1")).toBe(1);
        expect(c.get("t2")).toBe(1);
        expect(c.get("t3")).toBe(1);
    });
});

describe("applyTagToggle — 낙관적 갱신", () => {
    it("부착: 이름순 자리에 끼워 넣는다(부착 순서가 아니라)", () => {
        const next = applyTagToggle(att(), P, "t1", true, nameOf); // "다" → 가·나 뒤
        expect(next[0].tagIds).toEqual(["t2", "t3", "t1"]);
    });

    it("부착: 태그 0개이던 타점은 항목이 새로 생긴다", () => {
        const R = { stockCode: "035720", date: "2026-06-30", time: "11:00:00" };
        const next = applyTagToggle(att(), R, "t1", true, nameOf);
        expect(next).toHaveLength(3);
        expect(next[2]).toEqual({ ...R, tagIds: ["t1"] });
    });

    it("부착: 이미 붙어 있으면 그대로(멱등 — 새 배열도 안 만든다)", () => {
        const cur = att();
        expect(applyTagToggle(cur, P, "t2", true, nameOf)).toBe(cur);
    });

    it("해제: 그 태그만 빠지고, 마지막 하나면 항목째 사라진다(서버 표현과 동일)", () => {
        const one = applyTagToggle(att(), P, "t2", false, nameOf);
        expect(one[0].tagIds).toEqual(["t3"]);

        const gone = applyTagToggle(one, P, "t3", false, nameOf);
        expect(gone.map((a) => a.stockCode)).toEqual(["000660"]); // 빈 항목 안 남김
    });

    it("해제: 안 붙어 있으면 그대로", () => {
        const cur = att();
        expect(applyTagToggle(cur, P, "t1", false, nameOf)).toBe(cur);
    });

    it("원본을 건드리지 않는다(불변)", () => {
        const cur = att();
        applyTagToggle(cur, P, "t1", true, nameOf);
        expect(cur[0].tagIds).toEqual(["t2", "t3"]);
    });
});
