// 좌표 봉 사실 — 라벨 좌표(라벨=타점)의 종가·고가(원주가 UN, 원). 결과 걷기 분모·걷기 시그널 재료.
import { apiGet } from "./http.js";
import type { LabeledPointFactBundle } from "@trade-data-manager/wire";

export type { LabeledPointFact, LabeledPointFactBundle } from "@trade-data-manager/wire";

export const fetchLabeledPointFacts = (signal?: AbortSignal): Promise<LabeledPointFactBundle> =>
    apiGet<LabeledPointFactBundle>("labeled-point-facts", undefined, signal);
