// core/market/domain/review — 차트 앵커(사람 편집). 캔들 좌표 참조의 **단일 도메인** —
// 옛 가격선(priceLine)과 타점 파라미터 앵커(pointAnchor)를 흡수했다.
//
// **가격을 저장하지 않는다**: 항상 어떤 캔들의 어떤 값(field)을 가리키는 좌표만 저장하고, 값은 읽기 시점에
// 그 캔들에서 읽는다 — 수정계수가 바뀌어(권리락/액분) 캔들 스케일이 달라져도 자동으로 따라간다.
//
// **소유 grain 은 time 유무가 말한다**: 없으면 차트(종목,날짜) 소유, 있으면 타점 소유(예약).
// 현재 레지스트리의 param 은 전부 chart 소유다 — 타점 시각이 들어오면 저장 경로가 owner 선언과 대조해 거부한다.
// 첫 "both" param 이 생길 때 두 grain 의 병합 규칙(합집합/덮어쓰기/같은 후보 풀)을 그 param 의 성질로 정한다.
//
// **기준선(baseline)은 다중이다**: 차트에 그은 선 하나하나가 곧 기준선 후보이고(선=앵커 통합의 핵심),
// 계산 축이 쓸 "그 기준선"은 리졸버가 고른다 — 후보가 여럿이면 **가격이 가장 낮은 것**(사용자 규칙:
// 참고선을 낮게 그으면 그 선이 기준을 가져간다는 것을 받아들인 선택), 하나면 가격을 읽지 않고 확정
// (앵커 캔들 값이 미수집이어도 좌표만으로 동작하는 견고성 보존). application/service/shared/baselineResolver.ts.
//
// field·market 은 **한 쌍**이다:
//   · 둘 다 있음 = 가격 앵커 — 사람이 "이 시장의 이 값"까지 지목(KRX/UN 고가가 다르거나 NXT 오염 캔들 회피).
//   · 둘 다 없음 = 시각 앵커 — 좌표만 뜻이 있고 값은 축이 정한다(무시 캔들 같은 것).
// 분봉 앵커(anchorTime 있음)의 market 은 **'un' 고정** — 분봉 KRX 는 세션 부재(NXT 단독 시간대)가 있어
// 앵커로 쓸 수 없다. 홀로 있는 field/market 과 함께 anchorInputError 가 저장 경로에서 막는다.
//
// **surrogate id 인 이유**: 같은 캔들에 뜻이 다른 행이 여럿 정당하다(가격선 성질). 같은 좌표의 완전 중복은
// DB 유니크가 아니라 저장 경로(repository add 멱등)가 막는다 — 옛 자연키 유니크의 방어 이관.
import type { ReviewPointKey } from "./reviewPoint.js";

/** 가격 앵커의 시장. 앵커는 "어느 캔들"이 아니라 "어느 시장의 값"까지 지목할 수 있다(오염 캔들 회피). */
export type AnchorMarket = "krx" | "un";

/** 앵커 캔들에서 읽을 값. (옛 PriceLineField — 선이 앵커로 흡수되며 이름을 앵커 쪽으로 옮겼다.) */
export type AnchorField = "high" | "low" | "open" | "close";

/**
 * 필드/시장의 **런타임 목록** — 서버 검증(Set)과 메뉴(버튼 순서)가 여기서 파생한다.
 * 타입만 있으면 각 소비자가 네 값을 다시 나열하게 되고("레지스트리에 없는 건 존재하지 않는다" 위반),
 * 값이 늘 때 한 곳을 빠뜨린다. ANCHOR_FIELDS 의 순서 = UI 표시 순서(고·저·시·종).
 */
export const ANCHOR_FIELDS: readonly AnchorField[] = ["high", "low", "open", "close"];
export const ANCHOR_MARKETS: readonly AnchorMarket[] = ["un", "krx"];

/** 신규(미저장) 앵커 — add 입력. id 는 DB(bigserial)가 부여하므로 여기 없음. */
export interface NewChartAnchor {
    stockCode: string;
    date: string; // YYYY-MM-DD — 소유 차트의 거래일(로드 단위)
    time?: string; // HH:MM:SS — 있으면 타점 소유(예약. 현재 param 은 전부 chart — owner 게이트가 거부)
    param: string; // 파라미터 이름 — ANCHOR_PARAMS 레지스트리 키
    anchorDate: string; // YYYY-MM-DD — 가리키는 캔들의 거래일
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 앵커(market 'un' 고정), 없으면 일봉 앵커
    field?: AnchorField; // market 과 한 쌍(가격 앵커일 때만)
    market?: AnchorMarket;
}

/** 저장된 앵커 — 조회/응답 단위. id(surrogate bigint) 존재가 타입으로 보장. */
export interface ChartAnchor extends NewChartAnchor {
    id: string;
}

/**
 * 앵커가 있는 (종목, 거래일) 1건 — 작업셋 목록용 read model. count 는 그 차트의 기준선(=선) 개수.
 * name 은 app 레이어가 stock_master 로 붙인다(미등록이면 null — 물리 분리라 SQL 조인 불가).
 */
export interface AnchoredChart {
    stockCode: string;
    date: string;
    name: string | null;
    count: number;
}

/** field·market 쌍 규칙 — 둘 다 있거나(가격 앵커) 둘 다 없거나(시각 앵커). */
export function isValidAnchorShape(a: Pick<NewChartAnchor, "field" | "market">): boolean {
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
     * 소유 grain — 이 param 의 앵커가 붙는 곳. DB 컬럼(trade_time nullable)은 둘 다 표현할 수 있지만,
     * **한 param 이 두 grain 을 동시에 쓰는 병합 규칙은 아직 없다** — "both" 는 첫 실사용자가 규칙을 들고
     * 올 때까지 금지(저장 경로가 owner 와 time 유무 불일치를 거부한다).
     */
    owner: "chart" | "point";
    /**
     * 한 차트에 여러 개 매달 수 있는가. false = 그 param 의 앵커는 하나(재지정 = 교체), true = 좌표마다
     * 쌓인다(같은 좌표 재지정은 멱등 no-op — repository add 가 보장).
     * ⚠ DB 는 다중을 막지 않는다(surrogate id) — 단일 보장은 이 플래그를 읽는 저장 경로의 몫이다.
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
 * 저장 규칙 종합 검증 — 위반이면 사유 문자열, 통과면 null. 컨트롤러(400 사유)와 테스트가 공유한다.
 * 규칙: ① owner grain 일치 ② field⇔market 쌍(needsPrice) ③ 캔들 종류 제한 ④ 분봉 앵커 market='un'.
 */
export function anchorInputError(def: AnchorParamDef, a: NewChartAnchor): string | null {
    if (def.owner === "chart" && a.time != null) return `${def.name} 은 차트 소유 — 타점 시각을 받지 않습니다`;
    if (def.owner === "point" && a.time == null) return `${def.name} 은 타점 소유 — 타점 시각이 필요합니다`;
    if (def.needsPrice) {
        if (!a.field || !a.market) return `${def.key} 는 field·market 필수(가격 앵커)`;
    } else if (a.field != null || a.market != null) {
        return `${def.key} 는 시각 앵커 — field·market 금지`;
    }
    const isMinute = a.anchorTime != null;
    if (def.candles === "daily" && isMinute) return `${def.name} 은 일봉 캔들에만 지정합니다`;
    if (def.candles === "minute" && !isMinute) return `${def.name} 은 분봉 캔들에만 지정합니다`;
    if (isMinute && a.market != null && a.market !== "un") return "분봉 앵커의 market 은 'un' — KRX 분봉은 세션 부재(NXT 단독 시간대)가 있다";
    return null;
}

/** 기준선 키 — 레지스트리·리졸버·차트 표시가 같은 문자열을 봐야 해서 이름을 준다. */
export const BASELINE_PARAM = "baseline";

/**
 * 무시 캔들 키 — 왼쪽 스캔류 축이 **없는 셈 치고 넘어갈** 일봉. NXT 가짜 체결로 UN 고가가 튄 캔들이 주 대상.
 * ⚠ 사실("가짜 체결이었다")만 담는다. 판단까지 받으면 계산 축이 손배치가 된다(결과 분포가 순환논증).
 * **차트 소유인 이유(전역이 아니라)**: 처방 흐름이 "선 위로 삐죽 나온 봉이 보인다 → 우클릭 해제 → 그 차트만
 * 재계산"이다 — 전역이면 오늘 표시 하나가 과거 복기 전체의 축 값을 소급해 흔들고, 이미 손으로 배치한 순위와
 * 그 근거였던 축 값의 대응이 끊긴다. 날짜마다 다시 찍는 비용은 그 대가로 수용(그래도 옛 타점마다보다는 싸다).
 */
export const IGNORE_CANDLE_PARAM = "ignore-candle";

/**
 * 골격 키 — 타점까지의 경로를 손으로 찍은 **피벗 시퀀스**(상승→하락→상승횡보→…). 형태 분류의 입력.
 *
 * **다른 param 과 다른 성질**: 행 하나가 아니라 **여러 행이 모여 하나의 의미**다. 그래서 정체성이 좌표가
 * 아니라 **순서**인데, seq 컬럼을 두지 않는다 — 한 캔들 안에서 시·고·종의 시간 순서는 정리(定理)로 확정되고
 * (open=첫 틱, close=마지막 틱, high 는 그 사이), 캔들 간에는 날짜가 순서를 준다. 유일한 구멍인 "같은 캔들의
 * 高와 低"만 저장 경로가 막으면(skeletonSetError) 순서가 완전히 파생된다.
 * 나중에 분봉 골격에서 한 봉의 고·저가 다 필요해지면 그때 seq 를 추가하고 **기계적으로 백필**하면 된다
 * (지금 순서가 계산 가능하다는 게 곧 백필이 정확하다는 뜻).
 *
 * **차트 소유**: 일봉 골격의 모양은 장중에 안 변하므로 같은 날 타점들이 한 벌을 공유한다(기준선과 같은 논리).
 */
export const SKELETON_PARAM = "skeleton";

/**
 * 분봉 골격 키 — 그 날의 **장중 경로**를 찍은 피벗 시퀀스. 일봉 골격의 짝이지만 **별개 param 이다**
 * (param 이 곧 해상도라 "한 골격 안 해상도 통일" 검증이 필요 없다 — 섞일 표현이 없다).
 *
 * **차트 소유다**(처음엔 타점 소유였다가 옮겼다). 장중 경로는 그 날에 하나고, 타점은 그 경로를 자기
 * 시각에서 **끊어 보는 것**뿐이다 — 09:15 타점과 14:00 타점이 다른 건 경로가 아니라 절단점이다.
 * 타점 소유로 두면 같은 경로를 타점마다 다시 찍어야 하고, 화면은 같은 선을 여러 벌 겹쳐 그린다.
 *
 * ⚠ 그 대가로 축 규칙 2(타점 이후 정보 금지)의 보장이 **쓰기 시점 → 읽기 시점 절단**으로 옮겨갔다.
 * 절단은 resolveMinuteSkeletons(타점판) 안에서만 한다 — 분봉 골격을 타점 문맥으로 읽는 다른 경로를
 * 만들지 말 것(절단을 빠뜨린 경로는 미래 정보를 조용히 흘리고, 그건 눈으로 못 잡는다).
 * 상한: 일봉은 차트 날짜 이전, 분봉은 **차트 당일**(그 날 장중 — skeletonSetError).
 */
export const SKELETON_MINUTE_PARAM = "skeleton-minute";

/**
 * 파라미터 레지스트리 — 새 파라미터 = 여기 한 줄. 목록에 없는 param 은 존재하지 않는다.
 *   · baseline: 기준선(=차트에 그은 선). **다중** — 선을 긋는 행위가 곧 후보 추가이고, 축이 쓸 하나는
 *     리졸버가 "가격 최저"로 고른다. 일봉·분봉 어디든 그을 수 있다.
 *   · ignore-candle: 무시 캔들 — 위 상수 주석 참조.
 *   · skeleton: 일봉 피벗 골격(차트 소유) — 위 상수 주석 참조.
 *   · skeleton-minute: 분봉 피벗 골격(타점 소유·당일) — 위 상수 주석 참조.
 * 두 골격의 집합 규칙은 skeletonSetError 가 소유별로 본다(행 단위로는 못 보는 것).
 */
export const ANCHOR_PARAMS: readonly AnchorParamDef[] = [
    { key: BASELINE_PARAM, name: "기준선", needsPrice: true, owner: "chart", multiple: true },
    { key: IGNORE_CANDLE_PARAM, name: "무시 캔들", needsPrice: false, owner: "chart", multiple: true, candles: "daily" },
    { key: SKELETON_PARAM, name: "골격", needsPrice: true, owner: "chart", multiple: true, candles: "daily" },
    { key: SKELETON_MINUTE_PARAM, name: "분봉 골격", needsPrice: true, owner: "chart", multiple: true, candles: "minute" },
];

/** key → 정의. 검증·표시가 이름으로 지목할 때. */
export const anchorParamByKey = new Map(ANCHOR_PARAMS.map((p) => [p.key, p]));

/**
 * 이 앵커가 이 타점에 적용되는가 — 차트 소유(time 없음)는 그 차트의 모든 타점에, 타점 소유는 그 시각에만.
 * 계산 축 지문(ComputedAxes)과 축 구현이 같은 판정을 봐야 해서 도메인에 둔다.
 */
export function anchorAppliesTo(a: ChartAnchor, p: ReviewPointKey): boolean {
    return a.stockCode === p.stockCode && a.date === p.date && (a.time == null || a.time === p.time);
}

/** 앵커 좌표의 정렬 키 — `anchorDate T anchorTime`. 좌표 최신 비교(기준선 타이브레이크)가 이 문자열 사전순. */
export const anchorCoordKey = (a: Pick<NewChartAnchor, "anchorDate" | "anchorTime">): string => `${a.anchorDate}T${a.anchorTime ?? ""}`;

/**
 * 기준선 선택 규칙 — a 가 b 를 이기는가. **여기가 유일한 정의다**: 가격 최저(아래 선이 기준을 가져간다 —
 * 사용자 확정 규칙), 같으면 좌표 최신(그 가격대를 마지막으로 건드린 선이 살아있는 저항 + 결정성).
 * 서버 리졸버(계산 축이 실제로 쓰는 선)와 차트 표시(하늘색 "기준선" 라벨)가 **같은 함수**를 봐야 한다 —
 * 각자 비교식을 적으면 화면의 하늘색 선 ≠ 축이 재는 선이 조용히 생기고, 그 선이 육안 검증의 근거라 치명적이다.
 */
export function beatsAsBaseline(a: { price: number; coord: string }, b: { price: number; coord: string }): boolean {
    return a.price < b.price || (a.price === b.price && a.coord > b.coord);
}

/**
 * 앵커가 지목한 캔들 값의 해석 — 미수집(undefined)·0·비수치는 전부 **null(결손)**.
 * "0 은 무효"가 앵커 읽기의 규칙인데(0 가격 캔들은 데이터 오류), 소비자마다 Number+finite+양수 검사를
 * 손으로 반복하면 이 규칙이 한 곳만 바뀌는 사고가 난다(서버 리졸버 3곳·클라 3곳이 반복하던 것).
 */
export function candlePrice(raw: string | number | undefined): number | null {
    if (raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
}
