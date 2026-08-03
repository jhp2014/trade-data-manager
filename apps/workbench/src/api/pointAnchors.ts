// 타점 파라미터 앵커 CRUD 클라이언트 — 계산 축의 입력이 되는 캔들 좌표. wire 타입 공유.
// 가격선(priceLines)과 별도: 소유(차트 vs 타점)·역할(산출물 vs 재료)이 다르다. 좌표는 복사본(연결 아님).
import type { AnchorCoord, PointAnchor, PutPointAnchorInput } from "@trade-data-manager/wire";
import { apiGet, apiPut, apiDelete } from "./http.js";

export type { PointAnchor, PutPointAnchorInput } from "@trade-data-manager/wire";

/** 이 차트(종목,날짜) 모든 타점의 앵커. */
export const fetchPointAnchors = (code: string, date: string, signal?: AbortSignal): Promise<PointAnchor[]> =>
    apiGet<PointAnchor[]>("point-anchors", { code, date }, signal);

/** 지정. 재지정이 교체인지 누적인지는 파라미터 성질이라 서버가 정한다(AnchorParamDef.multiple). */
export const putPointAnchor = (input: PutPointAnchorInput): Promise<void> => apiPut("point-anchors", input);

/** 해제. coord 를 주면 그 캔들 하나만, 생략하면 그 param 전부. */
export const removePointAnchor = (
    point: { stockCode: string; date: string; time: string },
    param: string,
    coord?: AnchorCoord,
): Promise<void> =>
    apiDelete("point-anchors", {
        code: point.stockCode,
        date: point.date,
        time: point.time,
        param,
        // 빈 값을 실어 보내면 서버가 "좌표 지목"으로 읽는다 — 좌표 없는 해제와 구분되도록 키 자체를 뺀다.
        ...(coord?.anchorDate != null ? { anchorDate: coord.anchorDate } : {}),
        ...(coord?.anchorTime != null ? { anchorTime: coord.anchorTime } : {}),
    });
