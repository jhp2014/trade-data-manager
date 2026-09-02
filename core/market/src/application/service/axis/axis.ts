// core/market/application/axis — 계산 축(computed axis). 사람이 줄에 꽂는 판단 축(domain/rank)의 짝.
//
// 왜 판단 축과 구조가 다른가: 판단 축은 **순서만 있고 값이 없다** — 그래서 slot·order_key 로 위치 자체를 저장한다.
// 계산 축은 **값이 있다** → 저장할 위치가 없다(값에서 순서가 나온다). 그래서 여기는 placement 를 만들지 않고
// `타점 → 수치` 맵만 낸다. 줄로 세우는 건 소비자(클라)가 정렬로 한다.
//
// 불변 규칙 셋 — 어기면 캐시와 통계가 같이 깨진다:
//  1. **타점별 독립**: 한 타점의 값은 그 타점만으로 결정된다(다른 타점=모집단을 참조하지 않는다).
//     → 타점이 하나 늘어도 그것만 계산해 캐시에 덧붙이면 된다(전량 재계산 없음).
//     → 백분위·날짜별 정규화는 축의 일이 아니라 **질의 시점**의 일이다(모집단이 필터마다 다르다).
//        정규화를 축에 넣고 싶어지면 그건 새 축이지 이 축의 옵션이 아니다.
//  2. **타점 시각까지만**: 타점 이후의 정보(그날 종가·고가)를 쓰지 않는다. 쓰면 축이 아니라 outcome 이고,
//     "이 조건인 상황들의 결과 분포"가 순환논증이 된다.
//  3. **결손은 결손으로**: 재료가 없으면(분봉 부재·기준가 부재·해당 시장 세션 없음) 값을 지어내지 않고
//     결과에서 뺀다 = 그 축에 미배치. 소비자(3치 술어)가 이미 결손을 다룬다.
import type { ChartAnchor, ChartRef, Grain } from "#domain";
import type { AdjustedDailyReader, ChartAnchorReader, DailyMarketCapReader, MinuteReader, RawDailyReader } from "#port/query";

/** 시장 구분 — 축은 하나의 시장을 고른다(둘 다 보고 싶으면 축을 둘로. 축 안 토글 금지). */
export type AxisMarket = "krx" | "un";

/** 축이 읽는 재료의 선언. 지금은 문서·검수용이고, 앵커/가격선 의존 축이 들어오면 캐시 지문의 입력이 된다. */
export type AxisInput = "minute" | "rawDaily" | "adjDaily" | "marketCap";

/** 계산 축이 읽는 포트 묶음. 축마다 쓰는 게 다르지만 주입은 한 벌로 — 축 추가가 배선을 안 건드리게. */
export interface AxisDeps {
    minute: MinuteReader;
    rawDaily: RawDailyReader;
    adjDaily: AdjustedDailyReader;
    /** 차트 앵커(사람 입력 — 선·무시 캔들) — params 를 선언한 축만 읽는다. */
    chartAnchor: ChartAnchorReader;
    /** 날짜별 시총(daily_market_cap = 원주가 KRX 종가(D-1) × 주식수(D)) — 시총 축의 재료. */
    marketCap: DailyMarketCapReader;
}

/**
 * 값 표시 규격 — 시트 셀·필터 라벨·레일 눈금이 이걸 보고 찍는다. 생략 = 등락률 모양(`+12.3%`).
 * 클라에 단위 분기(`if (key === ...)`)를 두지 않으려고 **데이터로** 내려보낸다 — 그래야 축 추가 비용이
 * "파일 하나 + 레지스트리 한 줄"로 유지된다. 단위가 축의 속성이지 화면의 속성이 아니기도 하다.
 */
export interface AxisDisplay {
    /** 값 뒤 단위. 기본 "%". */
    suffix?: string;
    /** 소수 자릿수. 기본 1. */
    decimals?: number;
    /** 양수에 + 를 붙일지. 기본 true — 개수·기간처럼 부호가 뜻이 없는 축은 false. */
    signed?: boolean;
    /**
     * 레일 좌표 척도. "log" = 십진 로그 접힘 — 값이 수십·수만 배로 갈리는 축(시총)에서 선형이면
     * 소형 구간이 왼쪽 끝에 뭉개진다. 선언한 축은 **양수만** 내야 한다(0 이하는 결손 처리 — 로그의 정의역).
     * 값·필터 계약(원시 수치)은 그대로고 화면 좌표만 접힌다. 생략 = 선형.
     */
    scale?: "log";
}

/**
 * 우측 절단 표식 — "창 안에서 못 찾았다"처럼 **더 크다는 것만 아는** 경우.
 * 이때 `value` 는 참값이 아니라 **하한**(적어도 이만큼)이고, 줄에서의 자리는 실측 최댓값 **다음 칸**이다.
 *
 * 큰 상수(999 같은 것)로 대신하지 않는 이유가 둘: 척도가 찌그러져 실제 값들이 한쪽에 눌리고, "얼마나 큰지"를
 * 모르는데 아는 척하게 된다. 자리를 정하려면 모집단이 필요한데 축은 항목별 독립이라(규칙 1) 알 수 없으므로,
 * **축은 표시만 하고 자리는 질의 시점(클라)이 잡는다** — 백분위를 축에 안 넣는 것과 같은 이유다.
 */
interface AxisValueMark {
    value: number;
    saturated?: boolean;
}

/**
 * day 축 한 차트(종목,날짜)의 계산값 — **시각이 타입에 없다**: "타점 시각까지만"(규칙 2)의 day 판
 * ("그 하루가 시작하기 전까지만")이 주석이 아니라 타입으로 지켜진다. 결손인 차트는 배열에 없다.
 */
export interface DayAxisValue extends ChartRef, AxisValueMark {}

/**
 * 계산 축 하나의 정의(공통부). **축 하나 = 파일 하나**가 원칙 — 재료를 모으는 방법과 순수 계산 호출이
 * 한자리에 있어야 축을 고칠 때 한 파일만 본다. 순수 산술은 domain(candle/price 등)에 두고 여기서는 호출만 한다.
 * grain 이 compute 의 입력·출력 모양을 가른다(아래 두 정의) — **grain = 행의 정체성**이다.
 */
interface ComputedAxisDefCommon {
    /**
     * 안정 식별자. 캐시 파일명과 클라 축 id(`c:${key}`)에 쓰인다 —
     * ⚠ 바꾸면 캐시가 무효화되고 저장된 열 설정(고정·숨김·폭·컷)이 유령 키가 된다. 이름은 name 으로 바꿀 것.
     */
    key: string;
    /** 화면 표시 이름(자유롭게 변경 가능 — 식별자가 아니다). */
    name: string;
    /** 계산식 버전. **식을 바꾸면 반드시 올린다** → 구버전 캐시 파일이 자동 무효화된다. */
    version: number;
    /** 강한 쪽(줄의 오른쪽/rank 1)이 큰 값인가 작은 값인가. 클라가 orderKey 부호를 정하는 근거. */
    strongerWhen: "higher" | "lower";
    /** 값 표시 규격. 생략 = 등락률 모양. */
    display?: AxisDisplay;
    /** 읽는 재료 선언. */
    inputs: readonly AxisInput[];
    /**
     * **필수** 타점 파라미터(ANCHOR_PARAMS 키). 선언하면 캐시 계층이 **타점별 앵커 지문**을 캐시 키에 넣는다 —
     * 앵커를 지정/이동/해제하면 그 타점만 자동 재계산된다(사용자가 캐시를 의식할 일 없음).
     * 이게 없는 타점은 결손이 아니라 **"입력 전"**이라 결손 분모에서도 빠진다. 생략 = 앵커 무관(당일 % 류).
     */
    params?: readonly string[];
    /**
     * **선택** 타점 파라미터 — 지문에는 들어가지만(바뀌면 재계산) 없는 게 정상 상태인 것(무시 캔들 류).
     * params 와 갈라둔 이유는 결손 분모다: 여기 있는 걸 params 에 넣으면 "무시 캔들만 찍고 기준선은 아직 안 찍은"
     * 타점이 입력 완료로 집계돼 정상 상태가 상시 결손 경고가 된다.
     */
    optionalParams?: readonly string[];
}

/**
 * day 알갱이 축 — **행 = 차트(종목,날짜)**. 재료가 앵커·과거 일봉뿐이라 시각이 값에 안 들어간다.
 * 모수도 타점이 아니라 차트다: 분봉 타점을 아직 안 찍었어도 curation 입력(필수 param 앵커)이 있으면
 * 값이 나온다 — "계산 안 됨"이 "미배치"로 위장하던 옛 fanout 모델(타점 행)의 교정.
 *
 * ⚠ 규칙 2("타점 시각까지만")의 day 판: 절단선은 **그 하루가 시작하기 전**(전일까지, 사용자 확정).
 * 당일 데이터가 값에 들어가는 축은 day 로 선언하면 안 된다 — compute 가 시각을 아예 못 받으므로
 * (ChartRef 에 time 이 없다) 이 규칙 위반은 타입 수준에서 어렵게 되어 있다.
 */
export interface DayComputedAxisDef extends ComputedAxisDefCommon {
    grain: Extract<Grain, "day">;
    /** 배치 계산 — 차트 집합을 받아 값 있는 것만 돌려준다(결손·확정불가는 배열에 없음). */
    compute(charts: readonly ChartRef[], deps: AxisDeps): Promise<DayAxisValue[]>;
}

/**
 * 계산 축 정의 — **day 하나뿐이다**(2026-09-01). point 축은 서버에서 사라졌다: 타점이 읽기 층
 * 파생물이 되면서 그 값은 클라가 격자에서 낸다(workbench lib/gridFeatures). 유니온으로 남겨 두는 건
 * 소비자(캐시·피드)의 grain 분기가 계약으로 살아 있게 하기 위해서다 — wire 는 여전히 두 grain 을 싣는다.
 */
export type ComputedAxisDef = DayComputedAxisDef;

/**
 * day 알갱이 축의 절단선 — **당일 앵커는 재료가 아니다**(전일까지, ComputedAxisDef.grain 주석).
 * 지목한 param 의 앵커만 거른다(무시 캔들 등 다른 param 은 축이 제 규칙으로 다룬다).
 * ⚠ 리졸버·해소기에 넣기 **전에** 걸러야 한다 — 해소기는 "하나라도 미수집이면 통째 결손"이라,
 * 뒤에서 거르면 당일 캔들이 아직 없는 차트(오늘 복기)가 당일 앵커 하나에 전체를 잃는다.
 */
export const dropSameDayAnchors = (anchors: readonly ChartAnchor[], param: string): ChartAnchor[] =>
    anchors.filter((a) => a.param !== param || a.anchorDate < a.date);
