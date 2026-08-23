// 거래대금 → 획 굵기 척도 — 런(amountRuns)의 level 을 실제 px 로 바꾸는 공용 자.
// 골격 겹쳐 그리기에서 태어나 테이프가 물려받았다(옛 amountLayer 의 순수 척도 절반).
import { amountBucketIndex } from "@trade-data-manager/market/domain";
import { AMOUNT_LEVEL_OF_BUCKET, AMOUNT_LEVEL_WIDTH } from "../../chart/chartUtils.js";
import { LEVEL_MISSING, LEVEL_QUIET } from "./amountRuns.js";

/** 거래대금 구간 인덱스 → 굵기 단계. 구간 아래(-1)는 조용함(LEVEL_QUIET). */
export const amountLevelOf = (won: number): number => {
    const b = amountBucketIndex(won);
    return b < 0 ? LEVEL_QUIET : AMOUNT_LEVEL_OF_BUCKET[b];
};

/**
 * 런의 획 굵기 — 단계 × 선의 배수. 재료 없음(분봉 결손)은 **가장 가늘게**: 조용한 것과 같은 굵기로
 * 그리면 "거래가 없었다"와 "모른다"가 한 모양이 된다.
 */
export const runWidth = (level: number, scale: number): number =>
    (level === LEVEL_MISSING ? AMOUNT_LEVEL_WIDTH[LEVEL_QUIET] * 0.6 : AMOUNT_LEVEL_WIDTH[level] ?? AMOUNT_LEVEL_WIDTH[LEVEL_QUIET]) * scale;
