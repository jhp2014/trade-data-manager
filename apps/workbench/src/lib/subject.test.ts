import { describe, expect, it } from "vitest";
import { subjectPointKeys, subjectStatus, type Subject } from "./subject.js";
import { pointKeyOf } from "./pointKey.js";

// subject 계약의 순수 절반 — 3치 접기와 "하루 선택 = 그날 전 타점" 펼침.
// 폴백 조립(useSubject)은 store 훅이라 패널 dom 테스트가 간접 커버한다.

describe("subjectStatus — 불리언 둘 → 3치", () => {
    it("그려져 있으면 shown, 재료만 있으면 filtered, 둘 다 없으면 absent", () => {
        expect(subjectStatus(true, true)).toBe("shown");
        expect(subjectStatus(true, false)).toBe("filtered");
        expect(subjectStatus(false, false)).toBe("absent");
    });
});

describe("subjectPointKeys — 타점 단위 정의역과의 대조 키", () => {
    const times = ["09:31:00", "10:05:00"];

    it("타점 선택이면 그 시각 하나", () => {
        const s: Subject = { code: "005930", date: "2026-08-14", time: "09:31:00" };
        expect(subjectPointKeys(s, times)).toEqual([pointKeyOf("005930", "2026-08-14", "09:31:00")]);
    });

    it("하루 선택(time=null)이면 그날 전 타점 — 골격 분봉의 무리 선택이 이걸 탄다", () => {
        const s: Subject = { code: "005930", date: "2026-08-14", time: null };
        expect(subjectPointKeys(s, times)).toEqual(times.map((t) => pointKeyOf("005930", "2026-08-14", t)));
        expect(subjectPointKeys(s, [])).toEqual([]);
    });
});
