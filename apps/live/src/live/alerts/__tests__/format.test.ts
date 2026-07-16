import { describe, it, expect } from "vitest";
import { buildFiringMessages, formatFiring, priceEvidence, rankEvidence } from "../format.js";
import { plainText } from "../message.js";
import type { AlertFiring, LeafEvidence } from "../types.js";

const firing = (code: string, name: string, note?: string, evidence: LeafEvidence[] = []): AlertFiring => ({
    ruleId: `r-${code}-${note ?? ""}`,
    code,
    name,
    at: 0,
    features: { price: 71_000, changeRate: 2.1 },
    evidence,
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
    it("서버 로그 한 줄 — 종목 · 현재가 · 등락률 · 근거 · 메모", () => {
        const f = firing("005930", "삼성전자", "돌파", [{ kind: "price", text: "71,000원 ≥ 70,000원" }]);
        expect(formatFiring(f)).toBe("삼성전자(005930) · 71,000원 +2.10% · 71,000원 ≥ 70,000원 · 돌파");
    });
});

describe("leaf 근거 문구", () => {
    it("가격 — 실측가와 임계를 방향 기호로", () => {
        expect(priceEvidence({ kind: "price", op: "gte", value: 11_500 }, 12_000).text).toBe("12,000원 ≥ 11,500원");
        expect(priceEvidence({ kind: "price", op: "lte", value: 11_500 }, 11_000).text).toBe("11,000원 ≤ 11,500원");
    });

    it("순위 reach — 앞=실측 변화, 괄호=조건. '도달' 안 씀(가격이 돌파해 발화한 경우 순위 오해 방지)", () => {
        const leaf = { kind: "rank", theme: "반도체", market: "un", mode: "reach", threshold: 3 } as const;
        expect(rankEvidence(leaf, 3, 7).text).toBe("반도체 UN 7위→3위 (3위 이내)");
        expect(rankEvidence(leaf, 3, 3).text).toBe("반도체 UN 3위 유지 (3위 이내)"); // 계속 3위였는데 다른 leaf 로 발화
        expect(rankEvidence(leaf, 3, undefined).text).toBe("반도체 UN 3위 (3위 이내)"); // 이력 미적립 — undefined 인쇄 안 됨
    });

    it("순위 delta — 변화 + 계단 조건", () => {
        const leaf = { kind: "rank", theme: "반도체", market: "krx", mode: "delta", threshold: 3 } as const;
        expect(rankEvidence(leaf, 3, 7).text).toBe("반도체 KRX 7위→3위 (3계단↑)");
    });
});
