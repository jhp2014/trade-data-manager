// core/market/domain/rank — 순위 배치(ordinal placement, 사람 편집).
// 점수를 매기지 않고, 비교 차원(축)마다 복기 타점들을 상대순위 '줄'에 꽂는다.
//   · axis  : 순서를 매길 수 있는 하나의 비교 차원(일봉-형태·테마·거래대금·끼 …). 앱에서 CRUD.
//   · slot  : 줄 위 한 '위치'(order_key 로 정렬). 타이(같은 순위) = 여러 타점이 한 slot 공유.
//   · place : 타점 ↔ slot 배치. 타점은 review_points 자연키(stockCode,date,time)로 참조(situation 재사용).
// 검색("A위·B아래" + 확률)은 outcome 평가가 선행이라 후속 슬라이스. 여긴 줄 세우기(배치)까지만.

/** 비교 차원 1개(저장됨 → id 필수). */
export interface RankAxis {
    id: string;
    name: string;
}

/** 한 축 줄 위의 배치 1건(줄 렌더 피드 항목). 한 축 조회라 axisId 생략 — slotId 로 타이 묶고 orderKey 로 정렬. */
export interface PlacedPoint {
    slotId: string;
    orderKey: number;
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
}

/** 배치 대상 타점 자연키 = review point 삼중키. */
export interface RankPoint {
    stockCode: string;
    date: string;
    time: string;
}

/** 드롭 목표 — 기존 slot 합류(타이) | 두 slot 사이 새 slot(양끝 null 허용). */
export type RankTarget =
    | { kind: "slot"; slotId: string }
    | { kind: "between"; prevSlotId?: string; nextSlotId?: string };
