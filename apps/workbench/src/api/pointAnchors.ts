// 타점 파라미터 앵커 CRUD 클라이언트 — 계산 축의 입력이 되는 캔들 좌표. wire 타입 공유.
// 가격선(priceLines)과 별도: 소유(차트 vs 타점)·역할(산출물 vs 재료)이 다르다. 좌표는 복사본(연결 아님).
import type { PointAnchor, UpsertPointAnchorInput } from "@trade-data-manager/wire";
import { apiGet, apiPut, apiDelete } from "./http.js";

export type { PointAnchor, UpsertPointAnchorInput } from "@trade-data-manager/wire";

/** 이 차트(종목,날짜) 모든 타점의 앵커. */
export const fetchPointAnchors = (code: string, date: string, signal?: AbortSignal): Promise<PointAnchor[]> =>
    apiGet<PointAnchor[]>("point-anchors", { code, date }, signal);

/** 지정/교체(멱등 — PK=(타점,param)). */
export const upsertPointAnchor = (input: UpsertPointAnchorInput): Promise<void> => apiPut("point-anchors", input);

export const removePointAnchor = (point: { stockCode: string; date: string; time: string }, param: string): Promise<void> =>
    apiDelete("point-anchors", { code: point.stockCode, date: point.date, time: point.time, param });
