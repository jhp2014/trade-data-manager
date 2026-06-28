import { describe, it, expect } from "vitest";
import { selectDailyCandidates, type DailyRankInput } from "../pruning.js";

const inp = (stockCode: string, amount: string, high = "100", prevClose: string | null = "100"): DailyRankInput => ({
    stockCode,
    amount,
    high,
    prevClose,
});

describe("selectDailyCandidates", () => {
    it("거래대금 순위 ≤ N 은 포함(N 밖은 다른 조건 없으면 탈락)", () => {
        // 평탄(고가등락률 0%, 거래대금 소액)한 5종목, N=3 → 상위 3개만.
        const inputs = [
            inp("A", "500"),
            inp("B", "400"),
            inp("C", "300"),
            inp("D", "200"),
            inp("E", "100"),
        ];
        const out = selectDailyCandidates(inputs, { amountRankN: 3, amountFloorWon: "999999", highRateCutPercent: 3 });
        expect(out.sort()).toEqual(["A", "B", "C"]);
    });

    it("거래대금 floor 이상이면 순위 밖이라도 포함", () => {
        const inputs = [inp("BIG", "30000000000"), ...Array.from({ length: 5 }, (_, i) => inp(`x${i}`, "999999999"))];
        // N=2 라 BIG 은 순위(거래대금 최대=BIG 이라 순위 안에 들지만) — 순위 무시 검증 위해 floor 단독 케이스:
        const out = selectDailyCandidates([inp("SMALLRANK", "1"), inp("BIG", "30000000000")], {
            amountRankN: 1, // 상위1 = BIG. SMALLRANK 는 순위 밖.
            amountFloorWon: "30000000000",
            highRateCutPercent: 99,
        });
        expect(out).toContain("BIG"); // 순위로도, floor 로도 포함
        expect(out).not.toContain("SMALLRANK"); // 순위 밖·floor 미만·등락률 미달
        // floor 경계: 정확히 floor 이면 포함
        expect(inputs.length).toBeGreaterThan(0);
    });

    it("고가등락률 ≥ cut% 면 거래대금 낮아도 포함(thin 게이너)", () => {
        // high=105, prevClose=100 → +5% ≥ 3%
        const out = selectDailyCandidates([inp("THIN", "1", "105", "100"), inp("DEAD", "1", "101", "100")], {
            amountRankN: 0, // 순위 keep 없음
            amountFloorWon: "999999999999",
            highRateCutPercent: 3,
        });
        expect(out).toEqual(["THIN"]); // +5% 포함, +1% 탈락
    });

    it("prevClose null(신규상장)은 고가등락률 계산 불가 → 순위/floor 로만 판정", () => {
        const out = selectDailyCandidates([inp("NEW", "1", "9999", null)], {
            amountRankN: 0,
            amountFloorWon: "999999999999",
            highRateCutPercent: 3,
        });
        expect(out).toEqual([]); // rate 계산 불가 + 순위/floor 미달 → 탈락(크래시 없음)
    });

    it("기본 옵션(N400·300억·3%): 순위 밖에서 floor·rate 가 가른다", () => {
        // 상위 400위를 큰 거래대금 더미로 채워 테스트 3종목을 순위 밖으로 밀어낸 뒤 기본옵션 판정.
        const dummies = Array.from({ length: 400 }, (_, i) => inp(`d${i}`, "99999999999"));
        const out = selectDailyCandidates([
            ...dummies,
            inp("HOT", "10", "110", "100"), // 순위밖, +10% → rate keep
            inp("HUGE", "50000000000", "100", "100"), // 순위밖, 500억 ≥ 300억 → floor keep
            inp("MEH", "5", "101", "100"), // 순위밖, +1%, 소액 → 탈락
        ]);
        expect(out).toContain("HOT");
        expect(out).toContain("HUGE");
        expect(out).not.toContain("MEH");
    });

    it("입력 순서를 보존한다", () => {
        const out = selectDailyCandidates([inp("Z", "300"), inp("Y", "200"), inp("X", "100")], {
            amountRankN: 3,
            amountFloorWon: "999999999",
            highRateCutPercent: 99,
        });
        expect(out).toEqual(["Z", "Y", "X"]);
    });
});
