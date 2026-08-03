// /point-anchors 계약 — 타점 파라미터 앵커(계산 축의 입력 좌표). 값타입은 core/market 도메인 재노출.
// 가격선(/price-lines)과 별도: 소유(차트 vs 타점)·역할(산출물 vs 재료)이 다르다. 좌표는 복사본(연결 아님).
import type { PointAnchor, AnchorCoord, AnchorMarket, AnchorParamDef, PriceLineField } from "@trade-data-manager/market";

export type { PointAnchor, AnchorCoord, AnchorMarket, AnchorParamDef };

/**
 * PUT /point-anchors 요청 바디 — 앵커 지정. 같은 param 재지정이 교체인지 누적인지는 **서버가 정한다**
 * (AnchorParamDef.multiple). 클라가 고르는 게 아니라 파라미터의 성질이라 요청 바디에 플래그가 없다.
 */
export interface PutPointAnchorInput {
    stockCode: string;
    date: string; // 소유 타점 거래일
    time: string; // 소유 타점 시각
    param: string; // 레지스트리 키(서버가 검증)
    anchorDate: string; // 가리키는 캔들 거래일
    anchorTime?: string; // 있으면 분봉 앵커
    field?: PriceLineField; // market 과 한 쌍 — needsPrice 파라미터만
    market?: AnchorMarket;
}

/**
 * DELETE /point-anchors 쿼리 — 해제. anchorDate 를 주면 **그 좌표 하나만**, 생략하면 그 param 전부.
 * 다중 param(무시 캔들 등)은 좌표를 줘야 하나만 지워진다.
 */
export interface RemovePointAnchorQuery {
    code: string;
    date: string;
    time: string;
    param: string;
    anchorDate?: string;
    anchorTime?: string;
}
