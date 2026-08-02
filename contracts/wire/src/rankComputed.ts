// /rank-axes/computed 계약 — 계산 축(수식으로 나오는 축)의 타점별 수치.
// 판단 축(/rank-axes + /placements)과 달리 배치(slot·orderKey)를 서버가 만들지 않는다: 값만 준다.
// 줄 세우기(정렬·타이 묶기)와 순위·백분위는 **클라가 질의 시점에** 한다 — 모집단(필터 결과)이 화면마다 다르고,
// "전체 중 7등"과 "이 조건 안에서 3등"은 다른 값이라 서버가 미리 구우면 안 된다.
export interface ComputedAxisPoint {
    stockCode: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS
    value: number;
}

export interface ComputedAxisFeed {
    /** 안정 식별자. 클라 축 id 는 `c:${key}` — 판단 축 id(DB bigserial)와 절대 겹치지 않게. */
    key: string;
    name: string;
    /** 강한 쪽(rank 1)이 큰 값인지 작은 값인지 — 클라가 orderKey 부호를 정한다. */
    strongerWhen: "higher" | "lower";
    /** 값이 있는 타점만. 결손 타점은 여기 없다 = 그 축에 미배치. */
    values: ComputedAxisPoint[];
}
