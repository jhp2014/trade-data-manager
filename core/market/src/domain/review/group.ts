// core/market/domain/review — 타점 그룹(사람 편집). 순서 없는 **명목형 분류**.
// 축(domain/rank)과 짝이자 대비: 축 = "상하 순서를 매길 수 있는 하나", 그룹 = "순서가 없는 종류".
// 순서 없는 분류를 축에 배치했는지 여부로 표현하던 우회(있으면 A유형·없으면 B유형)를 대신한다.
//   · 한 타점에 여러 개(그게 명목형의 성질 — 단일 varchar 였던 reviewPoint.type 을 흡수).
//   · 사전(Group)과 부착(GroupAttachment) 분리 — 이름을 바꿔도 부착이 안 깨지고, 오타 난립을 사전이 막는다.
//   · 이름의 `그룹:값`(예: "형태:돌파")은 관례일 뿐 도메인 규칙이 아니다. 표시 색 그룹핑에만 쓴다.

/** 그룹 사전 항목 1개(저장됨 → id 필수). name 은 전역 유일. */
export interface Group {
    id: string;
    name: string;
}

/** 한 타점에 붙은 그룹들(부착 피드 항목). 전 타점을 한 번에 받아 클라가 키로 접는다. */
export interface GroupAttachment {
    stockCode: string;
    date: string; // YYYY-MM-DD (거래일)
    time: string; // HH:MM:SS (분봉 시각)
    groupIds: string[];
}

/** 차트 참조 — (종목, 날짜). 차트 소유 부착의 키. */
export interface ChartRef {
    stockCode: string;
    date: string; // YYYY-MM-DD
}

/**
 * 한 차트(종목,날짜)에 붙은 그룹들 — **차트 소유 부착**. 골격으로 상황을 분류할 때 쓴다(타점이 없는
 * 차트도 분류 대상이다 — 일봉 골격이 차트 소유인 것과 같은 이유). 사전(Group)은 타점 부착과 **공유**한다:
 * "돌파" 라는 분류가 타점의 것과 차트의 것으로 갈라질 이유가 없고, 사전이 갈리면 오타 난립이 두 배가 된다.
 * 적용 규칙은 앵커와 같다(anchorAppliesTo): 차트 그룹는 그 차트의 **모든 타점에 상속**된다.
 */
export interface ChartGroupAttachment extends ChartRef {
    groupIds: string[];
}
