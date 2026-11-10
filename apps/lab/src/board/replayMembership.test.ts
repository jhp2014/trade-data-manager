import { describe, expect, it } from "vitest";
import { replayMembership } from "./replayMembership.js";
import type { LabReplayDay } from "../market/types.js";

const day: LabReplayDay = {
    date: "2023-01-05",
    rows: [
        {
            code: "002990",
            name: "금호건설",
            labels: [
                { theme: "건설", sub: "두바이 투자", basis: ["issue", "base"], from: "14:11" },
                { theme: "건설", basis: ["base"], from: "open" },
            ],
            why: "두바이 투자에 상한가.",
        },
        { code: "032750", name: "삼진", labels: [{ theme: "스마트홈", sub: "삼성 초연결", basis: ["base", "ride"], from: "open" }], why: "" },
        { code: "000003", name: "다", labels: [{ theme: "조선", basis: ["issue"], from: "10:00" }], why: "w" },
    ],
};

describe("replayMembership", () => {
    it("그 시각까지 보인 이름표만 — 상위와 「상위/세부」 둘 다, 같은 상위는 한 번", () => {
        const { themes, notes } = replayMembership(day, "14:10");
        expect(themes.get("002990")).toEqual(["건설"]);
        expect(themes.get("032750")).toEqual(["스마트홈", "스마트홈/삼성 초연결"]);
        expect(themes.get("000003")).toEqual(["조선"]);
        expect(notes).toBeUndefined();
        expect(replayMembership(day, "14:11").themes.get("002990")).toEqual(["건설", "건설/두바이 투자"]); // 그 분부터
    });
    it("개장 전 시각엔 open 이름표만(장 전 지식) — 보이는 이름표가 없는 종목은 소속 없음", () => {
        const { themes } = replayMembership(day, "08:30");
        expect(themes.get("002990")).toEqual(["건설"]);
        expect(themes.has("000003")).toBe(false);
    });
    it("사후 보기(null) = 시각 무관 전부 + 이유(빈 이유는 뺀다)", () => {
        const { themes, notes } = replayMembership(day, null);
        expect(themes.get("002990")).toEqual(["건설", "건설/두바이 투자"]);
        expect(themes.get("000003")).toEqual(["조선"]);
        expect(notes).toEqual(new Map([["002990", "두바이 투자에 상한가."], ["000003", "w"]]));
    });
});
