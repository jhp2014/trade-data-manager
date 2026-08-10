// core/market/domain/map — 유사도 맵. 축(순서 있는 하나)도 태그(순서 없는 종류)도 못 담는 **연속적 닮음**.
//
// 눌림 하나를 놓고도 갈래가 끝없이 갈리는데 그걸 이름으로 계속 쪼갤 수는 없다 — 그림 분류는 연속적이라
// 어떤 그림은 A 무리와도 B 무리와도 닮고, 보는 특징에 따라 양쪽에 속한다(= 징검다리). 그래서 좌표축을
// 세우는 대신 **빈 평면에 닮은 것끼리 손으로 모은다**.
//
// **좌표에는 뜻이 없고 인접성에만 뜻이 있다.** 2차원은 다차원 닮음을 무왜곡으로 담을 수 없으므로 위치는
// 측정이 아니라 **기억**이다(지하철 노선도가 거리를 버리고 연결을 지키듯). 그 왜곡을 흡수하는 관절이
// 징검다리고, 징검다리가 어디에 놓였는지 자체가 정보가 된다.
//
// 배치가 손인 이유: 자동 임베딩은 재계산마다 지형이 흔들려 공간 기억을 무너뜨리고, 무엇보다 **배치라는
// 행위 자체가 직관을 쌓는 과정**이다. 기계는 "어디에 놓을지" 후보만 좁혀 준다(형태거리 최근접).

import type { ChartRef } from "../review/tag.js";

/**
 * 맵의 점이 무엇인가. day=(종목·날짜) 하루 / point=(종목·날짜·시각) 타점.
 * 자의적 구분이 아니라 **골격이 그 층위에서 정의되기 때문**이다(일봉 골격=차트 소유, 분봉 골격=타점 단위).
 * ⚠ RankAxis.scope 와 값은 같지만 기계가 다르다: 순위축의 day 는 "쓰기 팬아웃"(저장은 언제나 타점)이고,
 * 맵의 day 는 **행 자체가 하루**다. 맵에서 팬아웃하면 타점 5개짜리 하루가 같은 좌표에 겹친 점 5개가 된다.
 */
export type MapScope = "day" | "point";

/** 한 장의 평면. 이름은 전역 유일(맵은 몇 장 안 되고, 같은 이름 둘은 사고다). */
export interface SimilarityMap {
    id: string;
    name: string;
    scope: MapScope;
}

/**
 * 무리 = 라쏘 선택의 저장. parentId 로 중첩(무리 안 무리, 깊이 제한 없음).
 * **멤버 명단이 본체이고 화면의 테두리는 시각화일 뿐** — 그래서 위치가 소속을 구속하지 않는다.
 * 해체(삭제)는 멤버를 **부모로 올린다**(합쳐지는 것이지 흩어지는 게 아니다).
 */
export interface MapGroup {
    id: string;
    mapId: string;
    parentId: string | null;
    name: string;
}

/** 맵에 놓인 항목의 키. scope=day 면 time 없음 / scope=point 면 있음(저장 경로가 맵과 대조한다). */
export interface MapItemRef extends ChartRef {
    time?: string; // HH:MM:SS
}

/**
 * 자리 — 한 항목의 한 위치. **한 항목이 여러 자리를 가진다**(징검다리 = A 무리·B 무리·징검다리 무리에 동시에).
 * 그래서 자연키가 유일하지 않고 id 를 따로 든다. 자리는 최내곽 무리 **하나**에만 들어(groupId) 기하가
 * 겹치지 않는 트리로 남고, 여러 무리 소속이라는 진실은 자리들의 부채꼴이 진다 — **기하는 트리, 의미는 DAG**.
 * groupId=null 은 어느 무리에도 안 든 자유 배치(정상 상태).
 */
export interface MapPlacement {
    id: string;
    mapId: string;
    item: MapItemRef;
    x: number;
    y: number;
    groupId: string | null;
}

/** 새 자리(저장 전 — id 는 DB 가 준다). */
export interface NewMapPlacement {
    item: MapItemRef;
    x: number;
    y: number;
    groupId?: string | null;
}

/** 자리 이동 하나. 이동은 언제나 배열로 다룬다 — 다중선택·무리째 드래그가 1급이라 낱개로 쪼개면 부분 실패가 생긴다. */
export interface MapPlacementMove {
    id: string;
    x: number;
    y: number;
}

/**
 * 맵 말뭉치 — **전 맵을 한 번에**. 축의 listAllLines·태그의 listAllAttachments 와 같은 판단이다:
 * 소비자가 모두 전체를 보므로 왕복 1회·캐시 1개면 화면 간 어긋남이 불가능하고, 손이 만든 데이터라
 * 규모가 그 전제를 지킨다. 덤으로 **형제 자리 찾기가 공짜**가 된다(징검다리 호버 = 맵을 가로지르는 조회).
 * 셋을 평면 배열로 두는 이유: 무리를 자리 안에 박으면 이름·부모가 자리마다 중복되고 한쪽만 고치는 사고가 열린다.
 */
export interface MapCorpus {
    maps: SimilarityMap[];
    groups: MapGroup[];
    placements: MapPlacement[];
}
