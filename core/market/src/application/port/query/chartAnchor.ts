import type { AnchoredChart, ChartAnchor, NewChartAnchor } from "#domain";

// 차트 앵커 포트 — 읽기(Reader)/쓰기(Store) 분리(ISP). 둘 다 앱 대면(query).
// 옛 priceLine·pointAnchor 포트를 흡수한 단일 포트. 가격이 아니라 좌표를 저장한다 — in-place 수정 없음.
// 다중성·owner grain 같은 정책은 레지스트리(AnchorParamDef)를 읽는 호출자(컨트롤러)의 몫 —
// 저장소가 레지스트리를 알면 curation 쓰기가 도메인 정책에 결합된다(옛 포트와 같은 원칙).

/** 앵커 조회(읽기). 차트 표시(이 차트의 앵커들) + 계산 축(전량) + 작업셋 목록이 의존. */
export interface ChartAnchorReader {
    /** 이 차트(종목,날짜)의 모든 앵커 — id 오름차순(그린 순서). */
    listByChart(stockCode: string, date: string): Promise<ChartAnchor[]>;
    /** 전 앵커 — 계산 축 굽기(전 타점 대상)용. 사람 편집 규모라 페이징 불필요. */
    listAll(): Promise<ChartAnchor[]>;
    /** 기준선(=선)이 하나라도 있는 (종목,날짜)들 — 작업셋 목록(날짜 내림차순). name 없음(app 이 붙임). */
    listAnchoredCharts(): Promise<Omit<AnchoredChart, "name">[]>;
}

/** 앵커 편집(쓰기). 차트 우클릭 메뉴가 의존. */
export interface ChartAnchorStore {
    /**
     * 앵커 추가 — DB 가 부여한 id 를 채워 저장본으로 돌려준다(입력 순서 보존).
     * **멱등**: 같은 (차트, param, 좌표, field, market) 행이 이미 있으면 삽입하지 않고 기존 행을 돌려준다
     * (옛 자연키 유니크의 중복 방어를 저장 경로로 이관 — surrogate id 는 중복을 못 막는다).
     */
    add(anchors: NewChartAnchor[]): Promise<ChartAnchor[]>;
    /**
     * 앵커 1개 삭제(**자연키 지목**). 없는 앵커는 조용한 no-op.
     * id 가 아니라 좌표로 지목하는 이유: 읽기는 로컬 미러, 쓰기는 Supabase 라 **surrogate id 가 두 곳에서
     * 갈릴 수 있다**(로컬 시퀀스가 따로 돈다). 자연키는 그 불변식을 유지하는 대신 **없앤다** — id 는
     * 어느 쪽에서도 밖으로 안 나간다. 키 튜플은 add 의 멱등 판정(identityConds)과 같은 것이다.
     */
    remove(anchor: NewChartAnchor): Promise<void>;
    /** 이 차트의 그 param 전부 삭제 — 단일 param 의 교체(replace)와 "전부 해제"가 쓰는 재료. */
    removeByParam(stockCode: string, date: string, param: string): Promise<void>;

    /**
     * 이 **타점 소유** 앵커 전부 삭제(차트 소유 행은 안 건드린다).
     * FK 를 뺀 대가를 갚는 자리다 — 타점이 사라지면 그 시각 소유 앵커(분봉 골격)는 읽을 주인이 없어
     * 조용히 쌓이기만 한다. 타점 삭제 경로가 이걸 함께 부른다.
     */
    removeByPoint(stockCode: string, date: string, time: string): Promise<void>;
}
