// 타점 그룹 CRUD 클라이언트. wire 타입(Group·GroupAttachment)은 contracts/wire 공유.
// 부착은 타점 목록(review-points)과 분리된 계약이다 — 그룹를 토글해도 타점 캐시가 안 흔들리고,
// 차트(listByChart)·시트·배치·필터가 **부착 피드 하나**를 같이 본다(전 축 줄 피드와 같은 꼴).
import type { Group, GroupAttachment, ChartGroupAttachment } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiDelete } from "./http.js";

export type { Group, GroupAttachment, ChartGroupAttachment } from "@trade-data-manager/wire";

export const fetchGroups = (signal?: AbortSignal): Promise<Group[]> => apiGet<Group[]>("groups", undefined, signal);

/** 전 타점의 부착 한 방(타점 단건 조회 없음). 그룹 0개인 타점은 응답에 없음 = 빈 배열. */
export const fetchGroupAttachments = (signal?: AbortSignal): Promise<GroupAttachment[]> =>
    apiGet<GroupAttachment[]>("groups/attachments", undefined, signal);

/** 그룹 생성 — 같은 이름이 이미 있으면 서버가 그 그룹를 돌려준다(멱등). */
export const createGroup = (name: string): Promise<Group> => apiPost<Group>("groups", { name });

export const renameGroup = (id: string, name: string): Promise<void> => apiPatch(`groups/${id}`, { name });

/** 그룹 삭제 — 부착도 함께 사라진다(cascade). 호출부가 사용 건수를 확인시킬 것. */
export const deleteGroup = (id: string): Promise<void> => apiDelete(`groups/${id}`);

export const attachGroup = (groupId: string, point: { stockCode: string; date: string; time: string }): Promise<void> =>
    apiPost(`groups/${groupId}/attachments`, point);

export const detachGroup = (groupId: string, point: { stockCode: string; date: string; time: string }): Promise<void> =>
    apiDelete(`groups/${groupId}/attachments`, { code: point.stockCode, date: point.date, time: point.time });

// ── 차트 부착 — 골격 분류용(타점 없는 차트도 대상). 사전은 위와 공유.
export const fetchChartGroupAttachments = (signal?: AbortSignal): Promise<ChartGroupAttachment[]> =>
    apiGet<ChartGroupAttachment[]>("groups/chart-attachments", undefined, signal);

export const attachChartGroup = (groupId: string, chart: { stockCode: string; date: string }): Promise<void> =>
    apiPost(`groups/${groupId}/chart-attachments`, chart);

export const detachChartGroup = (groupId: string, chart: { stockCode: string; date: string }): Promise<void> =>
    apiDelete(`groups/${groupId}/chart-attachments`, { code: chart.stockCode, date: chart.date });
