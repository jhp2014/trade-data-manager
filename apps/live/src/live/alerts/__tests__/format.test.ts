import { describe, it, expect } from "vitest";
import { buildFiringMessages, formatFiring, renderEvidence, themeContextBlocks } from "../format.js";
import { plainText } from "../message.js";
import type { AlertFiring, AlertThemeContext, AlertThemeMember, LeafEvidence } from "../types.js";

const firing = (code: string, name: string, note?: string, evidence: LeafEvidence[] = [], themeContext?: AlertThemeContext): AlertFiring => ({
    ruleId: `r-${code}-${note ?? ""}`,
    code,
    name,
    at: 0,
    features: { price: 71_000, changeRate: 2.1 },
    evidence,
    themeContext,
    note,
});

const member = (rank: number, name: string, rateUn: number | null, rateKrx: number | null, tv: number, isSelf = false): AlertThemeMember => ({
    code: `c${rank}`,
    name,
    rateUn,
    rateKrx,
    rank,
    tradeValue: tv,
    themes: ["반도체"],
    isSelf,
});

describe("renderEvidence", () => {
    it("가격 — 실측가 op 임계", () => {
        expect(renderEvidence({ kind: "price", op: "gte", price: 12_000, value: 11_500 })).toBe("12,000원 ≥ 11,500원");
        expect(renderEvidence({ kind: "price", op: "lte", price: 11_000, value: 11_500 })).toBe("11,000원 ≤ 11,500원");
    });

    it("순위 reach — 앞=실측 변화, 괄호=조건. '도달' 안 씀(가격이 돌파해 발화한 경우 순위 오해 방지)", () => {
        const base = { kind: "rank", theme: "반도체", market: "un", mode: "reach", threshold: 3 } as const;
        expect(renderEvidence({ ...base, rank: 3, past: 7 })).toBe("반도체 UN 7위→3위 (3위 이내)");
        expect(renderEvidence({ ...base, rank: 3, past: 3 })).toBe("반도체 UN 3위 유지 (3위 이내)"); // 계속 3위였는데 다른 leaf 로 발화
        expect(renderEvidence({ ...base, rank: 3, past: undefined })).toBe("반도체 UN 3위 (3위 이내)"); // 이력 미적립 — undefined 안 나옴
    });

    it("순위 delta — 변화 + 계단 조건", () => {
        expect(renderEvidence({ kind: "rank", theme: "반도체", market: "krx", mode: "delta", rank: 3, past: 7, threshold: 3 })).toBe("반도체 KRX 7위→3위 (3계단↑)");
    });
});

describe("themeContextBlocks", () => {
    it("칩 한 줄 + 보드마다 헤더·멤버줄. 발화 종목은 화살표, KRX 는 괄호, 거래대금 억", () => {
        const ctx: AlertThemeContext = {
            chips: ["반도체", "AI"],
            boards: [{ theme: "반도체", members: [member(1, "SK하이닉스", 15.2, 14.9, 89_200), member(3, "삼성전자", 2.1, 1.8, 120_300, true)] }],
        };
        const text = themeContextBlocks(ctx).map((b) => (b.kind === "text" ? b.text : b.kind === "pre" ? b.text : "")).join("\n");
        expect(text).toContain("테마: 반도체 · AI");
        expect(text).toContain("[반도체 UN]");
        expect(text).toContain("1. SK하이닉스 +15.2%(+14.9%) 892억");
        expect(text).toContain("3. 삼성전자 ← +2.1%(+1.8%) 1,203억"); // 화살표 = 자신
    });

    it("텔레그램은 테마당 상위 5 + '외 M종목'(전 멤버는 구조에 있고 컷은 렌더 결정)", () => {
        const members = Array.from({ length: 8 }, (_, i) => member(i + 1, `종목${i + 1}`, 10 - i, null, 1_000));
        const [, pre] = themeContextBlocks({ chips: ["반도체"], boards: [{ theme: "반도체", members }] });
        const text = pre.kind === "pre" ? pre.text : "";
        expect(text).toContain("5. 종목5");
        expect(text).not.toContain("6. 종목6");
        expect(text).toContain("… 외 3종목");
    });

    it("KRX 전일종가 없으면 괄호 생략, UN 없으면 -", () => {
        const [, pre] = themeContextBlocks({ chips: ["반도체"], boards: [{ theme: "반도체", members: [member(1, "A", 5.0, null, 1_000), member(2, "B", null, null, 1_000)] }] });
        const text = pre.kind === "pre" ? pre.text : "";
        expect(text).toContain("1. A +5.0% "); // KRX 없음 → 괄호 없음
        expect(text).toContain("2. B -"); // UN 없음 → -
    });

    it("빈 컨텍스트(칩·보드 없음)면 블록 없음", () => {
        expect(themeContextBlocks({ chips: [], boards: [] })).toHaveLength(0);
    });
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

    it("테마 컨텍스트가 있으면 발화 메시지에 인라인으로 붙는다", () => {
        const ctx: AlertThemeContext = { chips: ["반도체"], boards: [{ theme: "반도체", members: [member(1, "SK하이닉스", 15.2, 14.9, 89_200)] }] };
        const [msg] = buildFiringMessages([firing("005930", "삼성전자", undefined, [], ctx)]);
        expect(plainText(msg)).toContain("[반도체 UN]");
        expect(plainText(msg)).toContain("SK하이닉스");
    });

    it("발화 메시지는 firing/high — 배달 게이트와 우선순위가 여기서 정해진다", () => {
        const [msg] = buildFiringMessages([firing("005930", "삼성전자")]);
        expect(msg.kind).toBe("firing");
        expect(msg.priority).toBe("high");
    });
});

describe("formatFiring", () => {
    it("서버 로그 한 줄 — 종목 · 현재가 · 등락률 · 근거 · 메모", () => {
        const f = firing("005930", "삼성전자", "돌파", [{ kind: "price", op: "gte", price: 71_000, value: 70_000 }]);
        expect(formatFiring(f)).toBe("삼성전자(005930) · 71,000원 +2.10% · 71,000원 ≥ 70,000원 · 돌파");
    });
});
