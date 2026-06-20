import { describe, expect, it, vi } from "vitest";
import { findOutcome, makeOutcomeValue } from "@/domain/outcome";

describe("findOutcome", () => {
    it("value 로 outcome 옵션을 찾고 null/unknown 은 undefined 를 반환한다", () => {
        const options = [{ value: "win", label: "익절", color: "green" as const }];

        expect(findOutcome(options, "win")).toEqual(options[0]);
        expect(findOutcome(options, null)).toBeUndefined();
        expect(findOutcome(options, "missing")).toBeUndefined();
    });
});

describe("makeOutcomeValue", () => {
    it("영문 label 은 varchar 길이에 맞는 slug 로 정규화한다", () => {
        expect(makeOutcomeValue("Big Win!!", [])).toBe("big-win");
        expect(makeOutcomeValue("ABCDEFGHIJKLMNOPQRSTUV", [])).toBe("abcdefghijklmnop");
    });

    it("충돌하면 숫자 suffix 를 붙인다", () => {
        expect(makeOutcomeValue("Big Win", ["big-win"])).toBe("big-win-2");
    });

    it("slug 를 만들 수 없는 label 은 시간 기반 키를 쓴다", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"));

        expect(makeOutcomeValue("익절", [])).toMatch(/^o[a-z0-9]+$/);

        vi.useRealTimers();
    });
});
