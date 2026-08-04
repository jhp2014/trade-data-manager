// /chart-anchors 계약 — 차트 앵커(선+파라미터 앵커 통합). 값타입은 core/market 도메인 재노출.
// 옛 /price-lines·/point-anchors 두 계약을 흡수했다: 선 = param 'baseline' 앵커, 소유는 차트(종목,날짜).
import type { ChartAnchor, NewChartAnchor, AnchoredChart, AnchorField, AnchorMarket, AnchorParamDef } from "@trade-data-manager/market";

export type { ChartAnchor, NewChartAnchor, AnchoredChart, AnchorField, AnchorMarket, AnchorParamDef };

/**
 * POST /chart-anchors 요청 바디 — 앵커 추가(가격이 아니라 캔들 좌표). 같은 좌표 재추가는 멱등(기존 행 반환).
 * param 별 규칙(owner grain·field·market 쌍·캔들 종류·분봉=un)은 서버가 레지스트리로 검증한다.
 * time 은 예약(타점 소유) — 현재 param 은 전부 chart 소유라 보내면 400.
 */
export type AddChartAnchorInput = NewChartAnchor;
