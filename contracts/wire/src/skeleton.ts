// /skeletons 계약 — 손으로 찍은 골격의 **가격까지 해소된 피벗 좌표**. 겹쳐 그리기(형태 미리보기)의 재료.
//
// 형태 측정값(기울기·되돌림률…)이 아니라 **좌표 그대로** 내려보내는 이유가 둘:
//  · 정규화 기준(첫 점 / 마지막 점)을 화면에서 토글한다 — 서버가 미리 정규화하면 토글마다 왕복이 생기고
//    같은 골격을 두 벌 굽게 된다. 정규화는 뺄셈·나눗셈이라 클라가 하는 게 옳다.
//  · 스칼라 측정은 이미 계산 축(/rank-axes/computed)이 낸다. 여기는 **그림용 원좌표 한 벌**이고, 축이
//    늘거나 줄어도 이 계약은 안 바뀐다(형태층 SkeletonShape 와 결합하지 않는다).

/** 골격 피벗 하나의 좌표. */
export interface SkeletonWirePivot {
    /** 시간 좌표 — 일봉=창 안 거래일 인덱스 · 분봉=벽시계 분. 원점은 무의미(차이만 쓴다). */
    t: number;
    price: number;
}

/** 골격 하나 = 폴리라인 하나. 일봉·분봉 둘 다 **차트(종목,날짜) 소유**다. */
export interface SkeletonWireEntry {
    stockCode: string;
    date: string; // YYYY-MM-DD
    /** 시간순 정렬된 피벗 2개 이상(그 미만은 골격이 아니라 응답에 없다). */
    pivots: SkeletonWirePivot[];
    /**
     * 전일 종가(UN, 수정주가) — **분봉 골격에만**. 절대 배치 뷰(정규화 없이 벽시계 x·등락률 y)의 분모다.
     * 종목이 달라도 등락률로 비교하려면 공통 기준이 필요한데, 그게 장중 경로에선 전일 종가다.
     * 없으면(전일 미수집) 절대 뷰에서 그 골격만 빠진다 — 지어내지 않는다.
     */
    prevClose?: number;
}

/** 차트에 그은 선 하나(가격 좌표) — 골격과 같은 % 공간에 얹힌다. */
export interface SkeletonWireLevel {
    price: number;
    /** 축들이 쓰는 그 기준선인가. 확정 불가(후보 중 못 읽은 게 있음)면 전부 false. */
    baseline: boolean;
}

/** 차트(종목,날짜) 하나의 선들. 골격과 달리 **항상 차트 소유**라 분봉 골격에도 이 목록이 붙는다. */
export interface SkeletonWireLevels {
    stockCode: string;
    date: string; // YYYY-MM-DD
    levels: SkeletonWireLevel[];
}

/**
 * 두 해상도를 한 응답에 담는다 — 화면이 토글로 오가고, 따로 받으면 토글마다 로딩이 뜬다.
 * 어느 쪽이든 **키가 없는 골격 = 미입력**, **결손(재료 부족)도 여기 없다**(둘의 구분은 화면에 필요 없다:
 * 둘 다 "그릴 게 없다"이고, 축과 달리 결손 분모를 세지 않는다).
 *
 * levels 를 골격 항목 안에 넣지 않고 따로 둔 이유: 선은 **차트 소유**라 일봉·분봉 골격이 같은 목록을
 * 공유한다. 항목마다 복사해 넣으면 같은 값이 두 배열에 중복되고, 나중에 한쪽만 고치는 사고가 열린다.
 */
export interface SkeletonFeed {
    daily: SkeletonWireEntry[];
    minute: SkeletonWireEntry[];
    levels: SkeletonWireLevels[];
}
