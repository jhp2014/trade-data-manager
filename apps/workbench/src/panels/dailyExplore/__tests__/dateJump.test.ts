// 거래일 이동 판의 입력 해석 — 받는 모양과 스냅 규칙("그날 또는 직전 거래일")을 잠근다.
import { describe, expect, it } from "vitest";
import { resolveDateInput } from "../DateJumpMenu.js";

const DATES = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-28"]; // 09-24~27 휴장인 목록

describe("resolveDateInput", () => {
    it("정확히 있는 날은 그 날로", () => {
        expect(resolveDateInput("2026-09-22", "2026-09-28", DATES)).toBe("2026-09-22");
    });

    it("거래일이 아니면 **직전 거래일**로 스냅 — 과거 복기라 '그날 또는 직전'이 자연스럽다", () => {
        expect(resolveDateInput("2026-09-27", "2026-09-28", DATES)).toBe("2026-09-23");
        expect(resolveDateInput("2026-09-24", "2026-09-28", DATES)).toBe("2026-09-23");
    });

    it("전부보다 이르면 첫 거래일", () => {
        expect(resolveDateInput("2026-01-01", "2026-09-28", DATES)).toBe("2026-09-21");
    });

    it("짧은 모양 — MM-DD·MMDD 는 지금 보는 해, YYYYMMDD 도 받는다", () => {
        expect(resolveDateInput("09-22", "2026-09-28", DATES)).toBe("2026-09-22");
        expect(resolveDateInput("0922", "2026-09-28", DATES)).toBe("2026-09-22");
        expect(resolveDateInput("20260922", "2026-09-28", DATES)).toBe("2026-09-22");
        expect(resolveDateInput(" 09-22 ", "2026-09-28", DATES)).toBe("2026-09-22");
    });

    it("모양이 아니거나 목록이 비면 null — 엉뚱한 점프를 지어내지 않는다", () => {
        expect(resolveDateInput("어제", "2026-09-28", DATES)).toBeNull();
        expect(resolveDateInput("9-2", "2026-09-28", DATES)).toBeNull();
        expect(resolveDateInput("", "2026-09-28", DATES)).toBeNull();
        expect(resolveDateInput("2026-09-22", "2026-09-28", [])).toBeNull();
    });
});
