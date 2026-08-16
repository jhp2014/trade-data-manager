// /groups 계약 — 그룹(이름 붙인 집합 + 관계·위치). 도메인 값타입은 core/market 를 **재노출**(단일 출처).
//
// 옛 태그 계약을 흡수했다. 부착 피드가 둘이었던 게(타점/차트) 하나로 합쳐진다 — 시각 유무로 갈리므로
// 나눌 이유가 없었다. 겹침(징검다리)은 **내려보내지 않는다**: 멤버십에서 계산되는 값이라 서버가 미리
// 구우면 같은 걸 두 벌 들고 있게 되고, 화면이 "선택한 그룹만" 같은 규칙으로 걸러 쓰기도 어렵다.
import type { Group, GroupScope, GroupItemRef, GroupMembership, GroupMove, GroupOverlap } from "@trade-data-manager/market";

export type { Group, GroupScope, GroupItemRef, GroupMembership, GroupMove, GroupOverlap };

// **지목은 이름으로, 이름은 바디에.** id 를 안 쓰는 이유는 도메인 타입 주석에 있다(로컬 미러와
// Supabase 가 각자 발급 → 동기화를 건넌 참조가 다른 행을 가리킨다). 이름을 경로에 안 싣는 이유는
// 사용자가 아무 문자나 넣을 수 있기 때문이다("타입: 돌파", 슬래시까지) — 인코딩 사고를 원천 차단한다.
// 그래서 삭제도 DELETE 가 아니라 POST /remove 다(앵커와 같은 규칙).

/** POST /groups 요청 바디(생성 — 같은 이름이면 기존 그룹 반환). */
export interface CreateGroupInput {
    name: string;
    scope: GroupScope;
}

/** PATCH /groups/rename 요청 바디. */
export interface RenameGroupInput {
    name: string;
    newName: string;
}

/** POST /groups/remove 요청 바디. */
export interface RemoveGroupInput {
    name: string;
}

/** POST /groups/members(넣기) · /groups/members/remove(빼기) 요청 바디 — 하루 소속이면 item.time 없음. */
export interface AttachGroupInput {
    group: string;
    item: GroupItemRef;
}

/** PUT /groups/placement 요청 바디 — 평면에 올리기. 내리기는 POST /groups/placement/remove. */
export interface PlaceGroupInput {
    name: string;
    mapName: string;
    x: number;
    y: number;
}

/** PATCH /groups/placements 요청 바디 — 좌표 이동은 **여럿 한 번에**(부분 실패 방지). */
export interface MoveGroupsInput {
    moves: GroupMove[];
}

/** PUT /groups/parent 요청 바디 — 그룹 안 그룹. parentName null 이면 최상위로. */
export interface SetGroupParentInput {
    name: string;
    parentName: string | null;
}
