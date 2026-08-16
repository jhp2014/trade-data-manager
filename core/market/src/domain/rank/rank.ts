// core/market/domain/rank — 순위 배치(ordinal placement, 사람 편집).
// 점수를 매기지 않고, 비교 차원(축)마다 복기 타점들을 상대순위 '줄'에 꽂는다.
//   · axis  : 순서를 매길 수 있는 하나의 비교 차원(일봉-형태·테마·거래대금·끼 …). 앱에서 CRUD.
//   · slot  : 줄 위 한 '위치'(order_key 로 정렬). 타이(같은 순위) = 여러 타점이 한 slot 공유.
//   · place : 타점 ↔ slot 배치. 타점은 review_points 자연키(stockCode,date,time)로 참조(situation 재사용).
// 검색("A위·B아래" + 확률)은 outcome 평가가 선행이라 후속 슬라이스. 여긴 줄 세우기(배치)까지만.
import type { Grain } from "../grain.js";
import type { ReviewPointKey } from "../review/reviewPoint.js";

/** 배치 단위(grain). point=타점별(종목·날짜·시각) / day=하루 일관(종목·날짜, place 시 그날 전 타점에 fanout). */
export type RankAxisScope = Grain;

/** 비교 차원 1개. **이름이 곧 정체성**(전역 유일) — id 는 저장소 안에만 산다. */
export interface RankAxis {
    name: string;
    scope: RankAxisScope;
}

/**
 * 한 축 줄 위의 배치 1건(줄 렌더 피드 항목). 한 축 조회라 축은 AxisLine 에 한 번만 붙는다.
 * **slotId 가 없다**: orderKey 가 같으면 같은 자리(=타이)다 — uq_rank_slot_position 이 그걸 보장하므로
 * 두 필드는 같은 말이었다. 게다가 slot 은 이름이 없어 계약에 실을 자연키가 없다.
 * orderKey 는 **참조가 아니라 값**이다 — 한 번 받아온 스냅샷 안에서 정렬하고 묶는 데만 쓴다
 * (reindex 가 값을 다시 쓰므로 들고 있다 나중에 지목하는 용도로는 못 쓴다 → 지목은 RankTarget 참조).
 */
export interface PlacedPoint {
    orderKey: number;
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
}

/** 한 축의 줄 전체(전축 조회 피드 항목). 축 하나를 지목하는 조회가 없으므로 축 이름은 여기 한 번만 붙는다. */
export interface AxisLine {
    axisName: string;
    placements: PlacedPoint[];
}

/** 배치 대상 타점 자연키 = review point 삼중키(그룹 부착과 같은 식별자 — 정의는 domain/review 한 곳). */
export type RankPoint = ReviewPointKey;

/**
 * 드롭 목표 — 기존 자리 합류(타이) | 두 자리 사이 새 자리(양끝 생략 = 줄 끝).
 *
 * **자리를 타점으로 지목한다.** slot 은 이름이 없고 order_key 는 reindex 가 자동으로 다시 쓰는 값이라,
 * 둘 다 계약 키로 못 쓴다(들고 있는 사이에 뜻이 바뀐다). 반면 타점은 (종목·날짜·시각) 자연키라
 * reindex 를 건너도 같은 것을 가리킨다. "이 타점이 있는 자리에" / "이 타점과 저 타점 사이에".
 * 빈 자리는 지목 자체가 불가능해지는데, 어차피 GC 대상이라 존재하면 안 되는 것이다.
 */
export type RankTarget =
    | { kind: "slot"; point: RankPoint }
    | { kind: "between"; after?: RankPoint; before?: RankPoint };
