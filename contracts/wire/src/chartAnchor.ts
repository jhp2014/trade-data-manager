// /chart-anchors 계약 — 차트 앵커(선+파라미터 앵커 통합). 값타입은 core/market 도메인 재노출.
// 옛 /price-lines·/point-anchors 두 계약을 흡수했다: 선 = param 'baseline' 앵커, 소유는 차트(종목,날짜).
import type { ChartAnchor, NewChartAnchor, AnchorField, AnchorMarket, AnchorParamDef } from "@trade-data-manager/market";

export type { ChartAnchor, NewChartAnchor, AnchorField, AnchorMarket, AnchorParamDef };

/**
 * POST /chart-anchors 요청 바디 — 앵커 추가(가격이 아니라 캔들 좌표). 같은 좌표 재추가는 멱등(기존 행 반환).
 * param 별 규칙(owner grain·field·market 쌍·캔들 종류·분봉=un)은 서버가 레지스트리로 검증한다.
 * time 은 예약(타점 소유) — 현재 param 은 전부 chart 소유라 보내면 400.
 */
export type AddChartAnchorInput = NewChartAnchor;

/**
 * POST /chart-anchors/remove 요청 바디 — 앵커 삭제. **자연키(좌표)로 지목**하며 id 는 쓰지 않는다:
 * 읽기가 로컬 미러라 surrogate id 가 원격과 갈릴 수 있어, id 를 되돌려 보내면 엉뚱한 행을 지운다.
 * 추가와 같은 튜플이라 타입도 같다 — 넣은 것과 같은 좌표를 보내면 그게 지워진다.
 * DELETE 가 아니라 POST 인 이유: 키가 8필드라 경로/쿼리에 싣기엔 크고, DELETE 바디는 지원이 들쭉날쭉하다.
 */
export type RemoveChartAnchorInput = NewChartAnchor;
