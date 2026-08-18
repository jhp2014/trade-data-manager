// 그룹 큐레이션 CRUD 클라이언트. wire 타입(Group·GroupMembership…)은 contracts/wire 공유.
//
// 옛 태그 클라를 흡수했다. **부착 피드가 하나**다(옛날엔 타점/차트 둘) — 멤버십은 시각 유무로 층위가
// 갈릴 뿐 같은 "이게 들었다"라서 나눌 이유가 없었다. 겹침(징검다리)은 받지 않고 멤버십에서 계산한다.
//
// **지목은 이름으로, 이름은 바디에.** id 는 계약을 안 건넌다(로컬 미러와 Supabase 가 각자 발급 →
// 동기화를 건넌 참조가 조용히 다른 행을 가리킨다). 이름을 경로에 안 싣는 건 자유 텍스트여서다.
import type { Group, GroupItemRef, GroupMembership, GroupScope } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiPut } from "./http.js";

export type { Group, GroupScope, GroupItemRef, GroupMembership } from "@trade-data-manager/wire";

export const fetchGroups = (signal?: AbortSignal): Promise<Group[]> => apiGet<Group[]>("groups", undefined, signal);

/** 전 항목의 멤버십 한 벌 — 하루 소속과 타점 소속이 한 피드에 온다(시각 유무로 갈린다). */
export const fetchGroupMemberships = (signal?: AbortSignal): Promise<GroupMembership[]> =>
    apiGet<GroupMembership[]>("groups/members", undefined, signal);

export const createGroup = (name: string, scope: GroupScope): Promise<Group> => apiPost<Group>("groups", { name, scope });

export const renameGroup = (name: string, newName: string): Promise<void> => apiPatch("groups/rename", { name, newName });

/** 삭제 — 멤버십도 함께 사라지고 자식 그룹은 부모만 풀린다. 확인은 호출부가 띄운다. */
export const deleteGroup = (name: string): Promise<void> => apiPost("groups/remove", { name }).then(() => undefined);

/** 항목 넣기(멱등). 시각 유무가 그룹 scope 와 맞지 않으면 서버가 거절한다. */
export const attachGroup = (group: string, item: GroupItemRef): Promise<void> =>
    apiPost("groups/members", { group, item }).then(() => undefined);

export const detachGroup = (group: string, item: GroupItemRef): Promise<void> =>
    apiPost("groups/members/remove", { group, item }).then(() => undefined);

/** 그룹 안 그룹. null 이면 최상위로. 층위가 안 맞거나 순환이면 서버가 거절한다. */
export const setGroupParent = (name: string, parentName: string | null): Promise<void> =>
    apiPut("groups/parent", { name, parentName });
