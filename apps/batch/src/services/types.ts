import { MinuteCandleInsert } from "@trade-data-manager/data-core";

/** Assembler가 누적합을 채워 넣기 전 단계의 분봉 row */
export type MinuteCandleRowDraft = Omit<MinuteCandleInsert, "accumulatedTradingAmount">;