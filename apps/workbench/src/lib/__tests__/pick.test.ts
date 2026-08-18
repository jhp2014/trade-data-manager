// 짚음의 층위 규칙 — 하루 항목은 그 차트의 **모든 타점**에 적용되고, 차트 단위 선은 짚은 타점이
// 하나라도 있으면 켜진다. 세는 것(롤업 금지)과 **강조**는 규칙이 다르다는 게 이 파일의 본론이다.
import { describe, it, expect } from "vitest";
import { inPick, pickKeys } from "../pick.js";

const D = "2026-07-01";
const day = { stockCode: "A", date: D };
const at = (time: string) => ({ stockCode: "A", date: D, time });

describe("pickKeys / inPick", () => {
    it("타점 항목은 그 시각만 켠다", () => {
        const k = pickKeys([at("09:30:00")]);
        expect(inPick(k, at("09:30:00"))).toBe(true);
        expect(inPick(k, at("10:00:00"))).toBe(false);
    });

    it("**하루 항목은 그 차트의 모든 타점**을 켠다 — 깔때기의 '타점으로 펼치기'와 같은 규칙", () => {
        const k = pickKeys([day]);
        expect(inPick(k, at("09:30:00"))).toBe(true);
        expect(inPick(k, at("15:20:00"))).toBe(true);
    });

    it("차트 단위 선은 짚은 타점이 하나라도 있으면 켜진다 — 세는 게 아니라 관련을 가리키는 일이다", () => {
        const k = pickKeys([at("09:30:00")]);
        expect(inPick(k, day)).toBe(true);
    });

    it("다른 종목·다른 날은 안 켜진다", () => {
        const k = pickKeys([day]);
        expect(inPick(k, { stockCode: "B", date: D })).toBe(false);
        expect(inPick(k, { stockCode: "A", date: "2026-07-02" })).toBe(false);
    });

    it("빈 짚음은 아무것도 안 켠다 — '렌즈 없음'은 호출자가 null 로 다룬다", () => {
        const k = pickKeys([]);
        expect(inPick(k, day)).toBe(false);
    });
});
