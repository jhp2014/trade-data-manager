// core/market/domain/review — 타점 파라미터 앵커(사람 편집). 계산 축의 **입력**이 되는 캔들 좌표.
//
// 가격선(priceLine)과 구분: 가격선은 차트 소유(보려고 그은 산출물), 앵커는 **타점 소유**(계산 재료).
// 타점 (종목,날짜,시각)이 이미 함의하는 좌표(그 차트의 가격선 등)는 앵커가 필요 없다 — 앵커는
// 타점이 함의하지 **않는** 추가 좌표만 담는다(급등 시작 캔들·기준선 캔들처럼 사람이 지목해야 아는 것).
//
// field·market 은 **한 쌍**이다:
//   · 둘 다 있음 = 가격 앵커 — 사람이 "이 시장의 이 값"까지 지목(KRX/UN 고가가 다르거나 NXT 오염 캔들 회피).
//   · 둘 다 없음 = 시각 앵커 — 좌표만 뜻이 있고 값은 축이 정한다(급등 시작 분봉 같은 것).
// 홀로 있는 field/market 은 불법 — 검증은 isValidAnchorShape.
import type { ReviewPointKey } from "./reviewPoint.js";
import type { PriceLineField } from "./priceLine.js";

/** 가격 앵커의 시장. 앵커는 "어느 캔들"이 아니라 "어느 시장의 값"까지 지목할 수 있다(오염 캔들 회피). */
export type AnchorMarket = "krx" | "un";

/** 타점 파라미터 앵커 1건. 자연키 (타점, param) — 한 타점은 한 param 의 앵커 하나(upsert 로 교체). */
export interface PointAnchor extends ReviewPointKey {
    param: string; // 파라미터 이름 — ANCHOR_PARAMS 레지스트리 키
    anchorDate: string; // YYYY-MM-DD — 가리키는 캔들의 거래일
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 앵커, 없으면 일봉 앵커
    field?: PriceLineField; // market 과 한 쌍(가격 앵커일 때만)
    market?: AnchorMarket;
}

/** field·market 쌍 규칙 — 둘 다 있거나(가격 앵커) 둘 다 없거나(시각 앵커). */
export function isValidAnchorShape(a: Pick<PointAnchor, "field" | "market">): boolean {
    return (a.field != null) === (a.market != null);
}

/**
 * 파라미터 정의 — 코드 레지스트리(계산 축 registry 와 같은 원리: 자유 문자열이면 오타가 조용한 결손).
 * needsPrice 가 UI 를 결정한다: true 면 지정 메뉴에 시장×값 목록이 펼쳐지고, false 면 클릭 한 번(시각만).
 */
export interface AnchorParamDef {
    /** 안정 식별자 — DB param 컬럼에 그대로 저장. ⚠ 바꾸면 기존 앵커가 유령이 된다(이름은 name 으로). */
    key: string;
    name: string;
    /** 가격 앵커인가 — true 면 field+market 필수, false 면 금지. */
    needsPrice: boolean;
}

/**
 * 파라미터 레지스트리 — 새 파라미터 = 여기 한 줄. 목록에 없는 param 은 존재하지 않는다.
 *   · baseline: 기준선 — "이 캔들의 이 값 대비 현재 위치"류 축의 분모. 가격선에서 따오는 게 보통이지만
 *     선 없이 캔들만 찍어도 된다(좌표 복사 — price_lines 와 연결 없음).
 */
export const ANCHOR_PARAMS: readonly AnchorParamDef[] = [
    { key: "baseline", name: "기준선", needsPrice: true },
];

/** key → 정의. 검증·표시가 이름으로 지목할 때. */
export const anchorParamByKey = new Map(ANCHOR_PARAMS.map((p) => [p.key, p]));
