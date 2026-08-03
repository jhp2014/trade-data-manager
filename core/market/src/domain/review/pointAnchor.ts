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
//
// 자연키는 **좌표까지**다: (타점, param, anchorDate, anchorTime). 파라미터에 따라 앵커가 여럿 붙을 수 있고
// (무시 캔들처럼 "이 캔들도, 저 캔들도"), 그럴 때 정체성은 "어느 캔들이냐" 자체이기 때문이다. 대리키를 안 쓰는
// 이유가 여기 있다 — 같은 좌표 둘은 의미가 없고 그냥 중복 오류라 자연키가 이미 완전하다(가격선은 반대라
// surrogate 를 쓴다: 같은 캔들에 뜻이 다른 선을 여러 개 그을 수 있다).
import type { ReviewPointKey } from "./reviewPoint.js";
import type { PriceLineField } from "./priceLine.js";

/** 가격 앵커의 시장. 앵커는 "어느 캔들"이 아니라 "어느 시장의 값"까지 지목할 수 있다(오염 캔들 회피). */
export type AnchorMarket = "krx" | "un";

/** 타점 파라미터 앵커 1건. 자연키 (타점, param, anchorDate, anchorTime). */
export interface PointAnchor extends ReviewPointKey {
    param: string; // 파라미터 이름 — ANCHOR_PARAMS 레지스트리 키
    anchorDate: string; // YYYY-MM-DD — 가리키는 캔들의 거래일
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 앵커, 없으면 일봉 앵커
    field?: PriceLineField; // market 과 한 쌍(가격 앵커일 때만)
    market?: AnchorMarket;
}

/** 앵커가 가리키는 캔들 좌표 = 자연키의 꼬리. 다중 param 의 앵커를 하나만 지목해 지울 때의 단위. */
export type AnchorCoord = Pick<PointAnchor, "anchorDate" | "anchorTime">;

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
    /**
     * 한 타점에 여러 개 매달 수 있는가. false = 그 param 의 앵커는 하나(재지정 = 교체 — 기준선처럼 분모가
     * 둘일 수 없는 것), true = 좌표마다 하나씩 쌓인다(같은 캔들 재지정은 멱등 no-op).
     *
     * ⚠ 자연키가 좌표까지 넓어진 뒤로 **DB 는 다중을 막지 않는다** — 단일 보장은 이 플래그를 읽는 저장 경로의
     * 몫이다. 플래그가 없으면 기준선이 둘인 타점이 저장 가능해지고, 축은 그중 "아무거나 하나"를 집는다(조용한 오류).
     */
    multiple: boolean;
    /**
     * 지정 가능한 캔들 종류 제한. 생략 = 일봉·분봉 둘 다(기준선).
     * "daily" 로 묶는 건 소비 축이 일봉만 훑기 때문 — 분봉에 찍으면 아무 축도 안 읽는 조용한 no-op 이 된다.
     * 메뉴가 이걸 보고 항목을 감추고, 서버도 같은 기준으로 거부한다(UI 만 막으면 계약이 아니라 습관이다).
     */
    candles?: "daily" | "minute";
}

/**
 * 파라미터 레지스트리 — 새 파라미터 = 여기 한 줄. 목록에 없는 param 은 존재하지 않는다.
 *   · baseline: 기준선 — "이 캔들의 이 값 대비 현재 위치"류 축의 분모. 가격선에서 따오는 게 보통이지만
 *     선 없이 캔들만 찍어도 된다(좌표 복사 — price_lines 와 연결 없음).
 *   · ignore-candle: 무시 캔들 — 왼쪽 스캔류 축이 **없는 셈 치고 넘어갈** 일봉. NXT 가짜 체결로 UN 고가가
 *     튄 캔들이 주 대상이다(고가 max 스캔은 이상치 하나에 통째로 뒤집힌다). 뜻을 특정 축에 매달지 않는다 —
 *     "이 타점의 과거 스캔에서 제외할 캔들"이라 왼쪽을 훑는 축이 늘어도 목록을 두 벌 만들지 않는다.
 *     ⚠ 사실("가짜 체결이었다")만 담는다. 판단("이 매물은 안 쳐준다")까지 받으면 축 값이 손으로 조정
 *     가능해지고, 그 순간 계산 축이 아니라 손배치가 된다(결과 분포가 순환논증이 된다).
 */
/** 무시 캔들 키 — 레지스트리·소비 축·차트 표시가 같은 문자열을 봐야 해서 이름을 준다(리터럴이면 오타가 조용한 결손). */
export const IGNORE_CANDLE_PARAM = "ignore-candle";

export const ANCHOR_PARAMS: readonly AnchorParamDef[] = [
    { key: "baseline", name: "기준선", needsPrice: true, multiple: false },
    { key: IGNORE_CANDLE_PARAM, name: "무시 캔들", needsPrice: false, multiple: true, candles: "daily" },
];

/** key → 정의. 검증·표시가 이름으로 지목할 때. */
export const anchorParamByKey = new Map(ANCHOR_PARAMS.map((p) => [p.key, p]));
