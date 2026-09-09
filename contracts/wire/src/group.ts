// /groups 계약 — 그룹(이름 붙인 집합 + 관계). 도메인 값타입은 core/market 를 **재노출**(단일 출처).
//
// 옛 태그 계약을 흡수했다. 멤버는 grain 별 두 종류다: 차트(종목, 날짜)와 **좌표 라벨**(종목, 날짜, 분 —
// 2026-09-09, Point 저장이 아니라 캔들 좌표에 붙은 라벨). 옛 scope·옵셔널 item.time(2026-09-01 폐지)은
// 되살리지 않는다 — grain 은 옵셔널 필드가 아니라 **타입·엔드포인트가 가른다**(time 을 실었는데 day
// 테이블에 들어가는 조용한 오분류를 타입 에러로 만든다). 겹침(징검다리)은 **내려보내지 않는다**: 멤버십에서 계산되는 값이라 서버가 미리
// 구우면 같은 걸 두 벌 들고 있게 되고, 화면이 "선택한 그룹만" 같은 규칙으로 걸러 쓰기도 어렵다.
import type { Group, GroupItemRef, GroupMembership, GroupPointItemRef, PointGroupMembership } from "@trade-data-manager/market";

export type { Group, GroupItemRef, GroupMembership, GroupPointItemRef, PointGroupMembership };

// **지목은 이름으로, 이름은 바디에.** id 를 안 쓰는 이유는 도메인 타입 주석에 있다(로컬 미러와
// Supabase 가 각자 발급 → 동기화를 건넌 참조가 다른 행을 가리킨다). 이름을 경로에 안 싣는 이유는
// 사용자가 아무 문자나 넣을 수 있기 때문이다("타입: 돌파", 슬래시까지) — 인코딩 사고를 원천 차단한다.
// 그래서 삭제도 DELETE 가 아니라 POST /remove 다(앵커와 같은 규칙).

/** POST /groups 요청 바디(생성 — 같은 이름이면 기존 그룹 반환). */
export interface CreateGroupInput {
    name: string;
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

/** POST /groups/members(넣기) · /groups/members/remove(빼기) 요청 바디 — item = 차트(종목, 날짜). */
export interface AttachGroupInput {
    group: string;
    item: GroupItemRef;
}

/** POST /groups/point-members(넣기) · /groups/point-members/remove(빼기) 요청 바디 — item = 캔들 좌표(종목, 날짜, 분). */
export interface AttachPointGroupInput {
    group: string;
    item: GroupPointItemRef;
}

/** PUT /groups/parent 요청 바디 — 그룹 안 그룹. parentName null 이면 최상위로. */
export interface SetGroupParentInput {
    name: string;
    parentName: string | null;
}
