// core/market/domain/pruning — 일봉 프루닝(분봉 수집 후보 선정). 순수함수(price.ts 외 import 0).
// 입력 = 한 거래일의 전종목(UN 기준 거래대금·고가·전일종가). 출력 = 분봉 수집 후보 stockCode 들.
//
// keep = (거래대금 순위 ≤ N) ∪ (거래대금 ≥ floor) ∪ (고가등락률 ≥ cut%)
//  - 순위 N(400): 활황일 컷이 올라가도 상위는 잡힘.
//  - floor(300억): 활황일 순위 밖이라도 큰 거래대금 종목 보존(순위만으론 누락 가능).
//  - 고가등락률 cut(3%): thin 게이너(거래대금 낮아도 많이 오른) 보존 → 조건식의 "등락률 탑50" 흡수.
// keep 의 여집합(순위 밖 & 거래대금<300억 & 등락률<3%)은 안전 폐기(어차피 조건식에 안 걸림).
// 랭킹·후보는 저장하지 않는다(복기 읽을 때 재계산). 여긴 superset 보장만, 최종 조건식은 복기에서.
import { computeChangeRate } from "./price.js";

export interface DailyRankInput {
    stockCode: string;
    /** UN(통합) 거래대금(원). */
    amount: string;
    /** UN 고가. */
    high: string;
    /** 전 거래일 UN 종가. 신규상장·첫날이면 null(고가등락률 계산 불가 → 순위/floor 로만 판정). */
    prevClose: string | null;
}

export interface PruneOptions {
    /** 거래대금 내림차순 상위 몇 위까지 포함. */
    amountRankN: number;
    /** 이 거래대금(원) 이상이면 순위 무관 포함. */
    amountFloorWon: string;
    /** 고가등락률(%)이 이 값 이상이면 포함. */
    highRateCutPercent: number;
}

export const DEFAULT_PRUNE_OPTIONS: PruneOptions = {
    amountRankN: 400,
    amountFloorWon: "30000000000", // 300억
    highRateCutPercent: 3,
};

/** 한 거래일 전종목 입력 → 분봉 수집 후보 stockCode 들(입력 순서 유지). */
export function selectDailyCandidates(
    inputs: DailyRankInput[],
    options: Partial<PruneOptions> = {},
): string[] {
    const { amountRankN, amountFloorWon, highRateCutPercent } = { ...DEFAULT_PRUNE_OPTIONS, ...options };
    const floor = BigInt(amountFloorWon);

    // 거래대금 내림차순 상위 N → 순위 keep 집합.
    const rankKeep = new Set(
        [...inputs]
            .sort((a, b) => {
                const x = BigInt(a.amount);
                const y = BigInt(b.amount);
                return x < y ? 1 : x > y ? -1 : 0;
            })
            .slice(0, amountRankN)
            .map((i) => i.stockCode),
    );

    const candidates: string[] = [];
    for (const i of inputs) {
        if (rankKeep.has(i.stockCode) || BigInt(i.amount) >= floor) {
            candidates.push(i.stockCode);
            continue;
        }
        const rate = computeChangeRate(i.high, i.prevClose); // (high - prevClose)/prevClose × 100
        if (rate !== null && Number(rate) >= highRateCutPercent) {
            candidates.push(i.stockCode);
        }
    }
    return candidates;
}
