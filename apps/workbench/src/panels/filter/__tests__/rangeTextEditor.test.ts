import { describe, it, expect } from "vitest";
import { parseRangeRow } from "../RangeTextEditor.js";

// 구간 정밀 입력의 줄 판정 — 특히 **순서 검사**. 표준값이 문자열이라 사전순으로 견주면 수치 편집기에서
// "5 ~ 30" 같은 멀쩡한 구간이 거부됐다("5" ≤ "30" 이 거짓). 날짜·시각 표기는 사전순이 곧 순서라 그대로다.

/** 수치 파서 — ValueRangeEditor 가 쓰는 것과 같은 규칙(수로 읽히면 표준화, 아니면 null). */
const parseNum = (raw: string): string | null =>
    Number.isFinite(Number(raw.trim())) && raw.trim() !== "" ? String(Number(raw.trim())) : null;
/** 시각 파서 흉내 — HH:MM 그대로(표기가 곧 표준값). */
const parseTime = (raw: string): string | null => (/^\d{2}:\d{2}$/.test(raw.trim()) ? raw.trim() : null);

describe("parseRangeRow — 순서는 값의 종류대로 견준다", () => {
    it("수치는 수로 — '5 ~ 30' 은 유효하다(사전순이면 거부되던 구간)", () => {
        expect(parseRangeRow({ from: "5", to: "30" }, parseNum, false).valid).toBe(true);
    });

    it("수치 역순은 거부된다", () => {
        expect(parseRangeRow({ from: "30", to: "5" }, parseNum, false).valid).toBe(false);
    });

    it("음수·소수도 수로 견준다", () => {
        expect(parseRangeRow({ from: "-3.5", to: "-1" }, parseNum, false).valid).toBe(true);
        expect(parseRangeRow({ from: "-1", to: "-3.5" }, parseNum, false).valid).toBe(false);
    });

    it("날짜·시각(수가 아닌 표준값)은 사전순 그대로", () => {
        expect(parseRangeRow({ from: "09:00", to: "10:30" }, parseTime, false).valid).toBe(true);
        expect(parseRangeRow({ from: "10:30", to: "09:00" }, parseTime, false).valid).toBe(false);
    });
});

describe("parseRangeRow — 읽기·반열림 규칙(기존 계약)", () => {
    it("못 읽은 값은 무효(빨간 줄) — 조용히 넘기지 않는다", () => {
        const r = parseRangeRow({ from: "오타", to: "10:00" }, parseTime, false);
        expect(r.valid).toBe(false);
        expect(r.touched).toBe(true);
    });

    it("반열림 허용이면 한쪽만으로 유효, 아니면 양끝 필수", () => {
        expect(parseRangeRow({ from: "5", to: "" }, parseNum, true).valid).toBe(true);
        expect(parseRangeRow({ from: "5", to: "" }, parseNum, false).valid).toBe(false);
    });

    it("빈 줄은 touched 가 아니다 — 아직 안 쓴 줄을 빨갛게 칠하지 않는다", () => {
        const r = parseRangeRow({ from: "", to: "" }, parseNum, true);
        expect(r.touched).toBe(false);
        expect(r.valid).toBe(false);
    });
});
