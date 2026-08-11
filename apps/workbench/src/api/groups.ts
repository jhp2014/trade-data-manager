// 그룹 큐레이션 CRUD 클라이언트. wire 타입(Group·GroupMembership…)은 contracts/wire 공유.
//
// 옛 태그 클라를 흡수했다. **부착 피드가 하나**다(옛날엔 타점/차트 둘) — 멤버십은 시각 유무로 층위가
// 갈릴 뿐 같은 "이게 들었다"라서 나눌 이유가 없었다.
// 좌표 이동은 **여럿 한 번에**(부분 실패 방지), 겹침(징검다리)은 받지 않고 멤버십에서 계산한다.
import type { Group, GroupItemRef, GroupMembership, GroupMove, GroupScope } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "./http.js";

export type { Group, GroupScope, GroupItemRef, GroupMembership, GroupMove, GroupOverlap } from "@trade-data-manager/wire";

export const fetchGroups = (signal?: AbortSignal): Promise<Group[]> => apiGet<Group[]>("groups", undefined, signal);

/** 전 항목의 멤버십 한 벌 — 하루 소속과 타점 소속이 한 피드에 온다(시각 유무로 갈린다). */
export const fetchGroupMemberships = (signal?: AbortSignal): Promise<GroupMembership[]> =>
    apiGet<GroupMembership[]>("groups/members", undefined, signal);

export const createGroup = (name: string, scope: GroupScope): Promise<Group> => apiPost<Group>("groups", { name, scope });

export const renameGroup = (id: string, name: string): Promise<void> => apiPatch(`groups/${id}`, { name });

/** 삭제 — 멤버십도 함께 사라지고 자식 그룹은 부모만 풀린다. 확인은 호출부가 띄운다. */
export const deleteGroup = (id: string): Promise<void> => apiDelete(`groups/${id}`);

/** 항목 넣기(멱등). 시각 유무가 그룹 scope 와 맞지 않으면 서버가 거절한다. */
export const attachGroup = (groupId: string, item: GroupItemRef): Promise<void> => apiPost(`groups/${groupId}/members`, item);

export const detachGroup = (groupId: string, item: GroupItemRef): Promise<void> =>
    apiDelete(`groups/${groupId}/members`, { code: item.stockCode, date: item.date, ...(item.time ? { time: item.time } : {}) });

/** 평면에 올리기(좌표 포함). 맵 scope 와 그룹 scope 가 다르면 서버가 거절한다. */
export const placeGroup = (id: string, mapId: string, x: number, y: number): Promise<void> =>
    apiPut(`groups/${id}/placement`, { mapId, x, y });

/** 평면에서 내리기 — 그룹은 남고 좌표·부모만 풀린다(자식들도 함께 내려온다). */
export const unplaceGroup = (id: string): Promise<void> => apiDelete(`groups/${id}/placement`);

/** 좌표 이동(여럿 한 번). 응답 없음 — 좌표는 클라가 저자라 낙관 갱신만 하고 invalidate 하지 않는다. */
export const moveGroups = (moves: GroupMove[]): Promise<void> => apiPatch("groups/placements", { moves });

/** 그룹 안 그룹. null 이면 최상위로. 같은 평면이 아니거나 순환이면 서버가 거절한다. */
export const setGroupParent = (id: string, parentId: string | null): Promise<void> => apiPut(`groups/${id}/parent`, { parentId });
