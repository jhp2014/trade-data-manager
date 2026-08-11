// /groups 계약 — 그룹(이름 붙인 집합 + 관계·위치). 도메인 값타입은 core/market 를 **재노출**(단일 출처).
//
// 옛 태그 계약을 흡수했다. 부착 피드가 둘이었던 게(타점/차트) 하나로 합쳐진다 — 시각 유무로 갈리므로
// 나눌 이유가 없었다. 겹침(징검다리)은 **내려보내지 않는다**: 멤버십에서 계산되는 값이라 서버가 미리
// 구우면 같은 걸 두 벌 들고 있게 되고, 화면이 "선택한 그룹만" 같은 규칙으로 걸러 쓰기도 어렵다.
import type { Group, GroupScope, GroupItemRef, GroupMembership, GroupMove, GroupOverlap } from "@trade-data-manager/market";

export type { Group, GroupScope, GroupItemRef, GroupMembership, GroupMove, GroupOverlap };

/** POST /groups 요청 바디(생성 — 같은 이름이면 기존 그룹 반환). */
export interface CreateGroupInput {
    name: string;
    scope: GroupScope;
}

/** PATCH /groups/:id 요청 바디(이름 변경). */
export interface RenameGroupInput {
    name: string;
}

/** POST /groups/:id/members 요청 바디(넣을 항목 — 하루 소속이면 time 없음). */
export type AttachGroupInput = GroupItemRef;

/** PUT /groups/:id/placement 요청 바디 — 평면에 올리기. 내리기는 DELETE. */
export interface PlaceGroupInput {
    mapId: string;
    x: number;
    y: number;
}

/** PATCH /groups/placements 요청 바디 — 좌표 이동은 **여럿 한 번에**(부분 실패 방지). */
export interface MoveGroupsInput {
    moves: GroupMove[];
}

/** PUT /groups/:id/parent 요청 바디 — 그룹 안 그룹. null 이면 최상위로. */
export interface SetGroupParentInput {
    parentId: string | null;
}
