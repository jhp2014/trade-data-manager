import { describe, it, expect } from "vitest";
import { buildFiringMessages, formatFiring } from "../format.js";
import { plainText } from "../message.js";
import type { AlertFiring } from "../types.js";

const firing = (code: string, name: string, note?: string): AlertFiring => ({
    ruleId: `r-${code}-${note ?? ""}`,
    code,
    name,
    at: 0,
    features: { price: 71_000, changeRate: 2.1 },
    note,
});

describe("buildFiringMessages", () => {
    it("종목당 1메시지 — 같은 종목 다중 조건은 한 메시지에 묶고, 다른 종목은 따로", () => {
        const msgs = buildFiringMessages([firing("005930", "삼성전자", "돌파"), firing("005930", "삼성전자", "테마 1위"), firing("000660", "SK하이닉스")]);
        expect(msgs).toHaveLength(2);
        const first = plainText(msgs[0]);
        expect(first).toContain("삼성전자(005930)");
        expect(first).toContain("돌파");
        expect(first).toContain("테마 1위");
        expect(plainText(msgs[1])).toContain("SK하이닉스(000660)");
    });

    it("같은 틱이면 시세가 같으므로 스칼라는 헤더에 한 번만", () => {
        const [msg] = buildFiringMessages([firing("005930", "삼성전자", "A"), firing("005930", "삼성전자", "B")]);
        const occurrences = plainText(msg).split("71,000원").length - 1;
        expect(occurrences).toBe(1);
    });

    it("발화 메시지는 firing/high — 배달 게이트와 우선순위가 여기서 정해진다", () => {
        const [msg] = buildFiringMessages([firing("005930", "삼성전자")]);
        expect(msg.kind).toBe("firing");
        expect(msg.priority).toBe("high");
    });
});

describe("formatFiring", () => {
    it("서버 로그 한 줄 — 종목 · 현재가 · 등락률 · 메모", () => {
        expect(formatFiring(firing("005930", "삼성전자", "돌파"))).toBe("삼성전자(005930) · 71,000원 +2.10% · 돌파");
    });
});
