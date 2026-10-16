import { describe, expect, it } from "vitest";
import { filled, type TgPage } from "./telegramFeed.js";

const cov = { from: "2026-07-20T00:00:00.000Z" /* 07-20 09:00 KST */, to: "2026-08-14T07:29:00.000Z" /* 08-14 16:29 KST */ };
const pg = (coverage: TgPage["page"]["coverage"]): TgPage => ({ window: { from: "x", to: "x" }, page: { items: [], coverage } });

describe("filled — 다시 읽을지(빠짐없이 든 날만 다시 안 읽는다)", () => {
    it("범위 안 = 다 듦 · 수집 끝 날 · 시작일 · 밖 · 모름 = 아직", () => {
        expect(filled("2026-07-31", [pg(cov)])).toBe(true);
        expect(filled("2026-08-14", [pg(cov)])).toBe(false);
        expect(filled("2026-07-20", [pg(cov)])).toBe(false);
        expect(filled("2026-08-15", [pg(cov)])).toBe(false);
        expect(filled("2026-07-31", [pg(null)])).toBe(false);
        expect(filled("2026-07-31", undefined)).toBe(false);
    });
    it("가장 최근에 받은 봉투의 범위로 — 백필이 진행되면 다 든 날이 된다", () => {
        const later = { ...cov, to: "2026-08-15T07:29:00.000Z" };
        expect(filled("2026-08-14", [pg(cov), pg(later)])).toBe(true);
    });
});
