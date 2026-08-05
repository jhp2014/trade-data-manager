// core/market/domain/review — 피벗 골격의 **순서·집합 규칙과 형태 계산**(순수). 저장은 chartAnchor(param 'skeleton').
//
// 왜 이 파일이 따로 있나: 골격은 "여러 앵커 행이 모여 하나의 의미"라 행 단위 검증(anchorInputError)으로는
// 규칙을 표현할 수 없다. 순서 파생·집합 검증·형태 측정이 전부 여기 모여 있고, **계산 축은 이 결과를 고르기만 한다**
// (축이 자주 바뀔 예정이라, 바뀌는 층과 안 바뀌는 층을 갈라두는 게 이 파일의 존재 이유).
//
// ## 순서는 저장하지 않고 파생한다
// 한 캔들 안: open=첫 틱, close=마지막 틱, high/low 는 그 사이 → **시 → (고|저) → 종**이 항상 참이다(정리).
// 캔들 간: 날짜(·시각)가 순서를 준다. 유일한 모호점은 **같은 캔들의 高와 低**(OHLC 만으론 선후를 모른다)이고
// 그것만 저장 경로가 막으므로(skeletonSetError), seq 컬럼 없이 순서가 완전히 결정된다.
//
// ## 라벨을 찍지 않는다
// "상승/하락/횡보"는 입력이 아니라 파생이다. 사람마다 다르게 부르는 것을 입력 시점에 강요하면 그게 바로
// 이 시스템이 피하려는 "명확하게 안 떨어지는 분류"가 된다. 세그먼트의 뜻은 크기·기간·기울기가 말한다.
import type { AnchorField, AnchorMarket } from "./chartAnchor.js";

/**
 * 골격 피벗 하나 — 캔들 좌표 + **어느 시장의 어떤 값**인지. 가격은 읽기 시점에 해소한다(저장은 좌표뿐).
 * market 이 점마다인 이유: UN(통합)은 NXT 개장 이후에만 있고 미상장 종목엔 없어서, 골격이 그 경계를 걸치면
 * 시퀀스 단위 기준은 성립 자체가 안 된다. %계산에 섞여 들어가는 오차는 KRX/UN 차이가 작아 수용.
 */
export interface SkeletonPivot {
    anchorDate: string; // YYYY-MM-DD
    anchorTime?: string; // HH:MM:SS — 있으면 분봉 피벗(한 골격 안에서 해상도는 통일, market 은 'un' 고정)
    field: AnchorField;
    market: AnchorMarket;
}

/**
 * 한 캔들 안에서의 시간 순위 — 시(0) → 고·저(1) → 종(2).
 * 고와 저가 같은 순위인 건 **둘의 선후를 모르기 때문**이고, 그래서 같은 캔들에 둘 다 찍는 것을 막는다.
 */
export const FIELD_RANK: Readonly<Record<AnchorField, number>> = { open: 0, high: 1, low: 1, close: 2 };

/** 정렬 키 — 날짜 → 시각 → 캔들 내 순위. 이 셋이면 순서가 유일하게 정해진다(위 제약이 지켜지는 한). */
const sortKey = (p: SkeletonPivot): string => `${p.anchorDate}T${p.anchorTime ?? ""}#${FIELD_RANK[p.field]}`;

/** 시간순 정렬 — 골격을 읽는 모든 곳이 이 함수 하나를 쓴다(정렬 규칙이 흩어지면 순서가 갈린다). */
export function sortPivots<T extends SkeletonPivot>(pivots: readonly T[]): T[] {
    return [...pivots].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
}

/**
 * 집합 규칙 검증 — 이 골격에 피벗 하나를 **더할 때** 위반이면 사유, 통과면 null.
 * 행 단위(anchorInputError)로는 볼 수 없는 것만 여기 있다:
 *  ① 차트 날짜 **이전** 캔들만 — 당일 캔들을 찍으면 09:15 타점이 15:30 고가를 보게 된다(축 규칙 2 위반).
 *     타점 당일의 슈팅은 골격의 일부가 아니다(골격 = 그 슈팅에 이르기까지의 이력).
 *  ② 같은 캔들에 高·低 동시 금지 — 순서 파생의 유일한 구멍(seq 를 안 두는 대가로 지키는 규칙).
 *  ③ 한 골격 안 해상도 통일 — 일봉 피벗과 분봉 피벗이 같은 날짜에 섞이면 순서가 다시 모호해진다.
 *  ④ 같은 캔들·같은 값 중복 금지 — 같은 점을 두 번 찍은 것(저장소 멱등이 잡지만 사유를 알려주는 게 낫다).
 */
export function skeletonSetError(chartDate: string, existing: readonly SkeletonPivot[], added: SkeletonPivot): string | null {
    if (added.anchorDate >= chartDate) return "골격 피벗은 차트 날짜 이전 캔들만 — 당일 봉은 타점 이후 정보를 담는다";

    const isMinute = added.anchorTime != null;
    for (const p of existing) {
        if ((p.anchorTime != null) !== isMinute) return "한 골격 안에서 일봉·분봉 피벗을 섞을 수 없습니다";
        if (p.anchorDate !== added.anchorDate || (p.anchorTime ?? "") !== (added.anchorTime ?? "")) continue;
        if (p.field === added.field) return "이미 찍은 점입니다";
        if (FIELD_RANK[p.field] === FIELD_RANK[added.field]) return "같은 캔들에 고가와 저가를 함께 찍을 수 없습니다 — 둘의 선후를 알 수 없습니다";
    }
    return null;
}

// ── 형태 계산 ───────────────────────────────────────────────────────────────
// 축이 고를 **측정값 전부**를 한 번에 낸다. 새 측정 = 여기 필드 하나 + 계산 한 줄이고, 새 축은 그걸 고르기만
// 한다(축이 자주 바뀌어도 이 층은 안 흔들린다). ⚠ 이 층의 계산을 고치면 SKELETON_SHAPE_VERSION 을 올린다 —
// 파생 축들이 **다 같이** 무효화돼야 하기 때문(개별 축 version 만 올리면 나머지가 스테일로 남는다).

/** 가격까지 해소된 피벗 — 형태 계산의 입력. 가격 해소는 application 층(resolveSkeletons)의 몫. */
export interface PricedPivot extends SkeletonPivot {
    price: number;
    /** 이 피벗까지 흐른 거래일 — 창의 첫 봉을 0으로 한 인덱스. 세그먼트 기간을 달력이 아니라 거래일로 재려고. */
    dayIndex: number;
}

/** 골격 하나에서 나오는 측정값 전부. 축은 여기서 하나를 고른다. */
export interface SkeletonShape {
    /** 손으로 찍은 점 개수 — 경로의 복잡도(축약 전 원 해상도). */
    pivotCount: number;
    /** 본상승 = P1→P2(첫 세그먼트). 사용자 확정 정의 — P2 가 대개 기준선 앵커라 기존 기준선 축들과 반대쪽을 잰다. */
    baseRisePct: number;
    /** 본상승 거래일. 같은 캔들 안의 상승(윗꼬리 슈팅)이면 0 — 그 자체가 식별 신호다. */
    baseRiseDays: number;
    /** 본상승 기울기(%/거래일). 거래일 0이면 **결손**(0으로 나누지 않고 지어내지도 않는다 — 축 규칙 3). */
    baseRiseSlope: number | null;
    /**
     * 되돌림률 = (P2 − P2 이후 최저 피벗) / (P2 − P1).
     * 점이 2개면 **0**(되돌림 없음을 사람이 단언한 것 — 골격 자체가 없는 것과 다르다).
     * 100% 초과 가능(본상승을 다 반납하고 더 빠진 것) — 클램프하면 그 정보가 사라진다.
     * 분모 ≤ 0(첫 세그먼트가 상승이 아님)이면 정규화할 수 없어 결손.
     */
    pullbackRatio: number | null;
    /**
     * 전역 최고 피벗이 P2 인가 — 본상승 정의 A(첫 세그먼트)의 **감시 장치**.
     * false 가 잦으면 W 의 두 번째 고점이 더 높은 경우가 많다는 뜻이고, 그때가 정의를 다시 볼 신호다.
     */
    peakIsFirstHigh: boolean;
}

/** 형태 계산 — 정렬된 가격 피벗 2개 이상. 미만이면 골격이 아니다(null). */
export function skeletonShape(sorted: readonly PricedPivot[]): SkeletonShape | null {
    if (sorted.length < 2) return null;
    const p1 = sorted[0];
    const p2 = sorted[1];

    const baseRisePct = ((p2.price - p1.price) / p1.price) * 100;
    const baseRiseDays = p2.dayIndex - p1.dayIndex;
    const baseRiseSlope = baseRiseDays > 0 ? baseRisePct / baseRiseDays : null;

    const rise = p2.price - p1.price;
    const after = sorted.slice(2);
    let pullbackRatio: number | null;
    if (rise <= 0) pullbackRatio = null; // 첫 세그먼트가 상승이 아님 — 정규화 불가
    else if (after.length === 0) pullbackRatio = 0; // 2점 = "되돌림 없음"의 단언
    else pullbackRatio = ((p2.price - Math.min(...after.map((p) => p.price))) / rise) * 100;

    const maxPrice = Math.max(...sorted.map((p) => p.price));
    return {
        pivotCount: sorted.length,
        baseRisePct,
        baseRiseDays,
        baseRiseSlope,
        pullbackRatio,
        peakIsFirstHigh: p2.price === maxPrice,
    };
}
