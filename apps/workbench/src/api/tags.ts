// 타점 태그 CRUD 클라이언트. wire 타입(Tag·TagAttachment)은 contracts/wire 공유.
// 부착은 타점 목록(review-points)과 분리된 계약이다 — 태그를 토글해도 타점 캐시가 안 흔들리고,
// 차트(listByChart)·시트·배치·필터가 **부착 피드 하나**를 같이 본다(전 축 줄 피드와 같은 꼴).
import type { Tag, TagAttachment, ChartTagAttachment } from "@trade-data-manager/wire";
import { apiGet, apiPost, apiPatch, apiDelete } from "./http.js";

export type { Tag, TagAttachment, ChartTagAttachment } from "@trade-data-manager/wire";

export const fetchTags = (signal?: AbortSignal): Promise<Tag[]> => apiGet<Tag[]>("tags", undefined, signal);

/** 전 타점의 부착 한 방(타점 단건 조회 없음). 태그 0개인 타점은 응답에 없음 = 빈 배열. */
export const fetchTagAttachments = (signal?: AbortSignal): Promise<TagAttachment[]> =>
    apiGet<TagAttachment[]>("tags/attachments", undefined, signal);

/** 태그 생성 — 같은 이름이 이미 있으면 서버가 그 태그를 돌려준다(멱등). */
export const createTag = (name: string): Promise<Tag> => apiPost<Tag>("tags", { name });

export const renameTag = (id: string, name: string): Promise<void> => apiPatch(`tags/${id}`, { name });

/** 태그 삭제 — 부착도 함께 사라진다(cascade). 호출부가 사용 건수를 확인시킬 것. */
export const deleteTag = (id: string): Promise<void> => apiDelete(`tags/${id}`);

export const attachTag = (tagId: string, point: { stockCode: string; date: string; time: string }): Promise<void> =>
    apiPost(`tags/${tagId}/attachments`, point);

export const detachTag = (tagId: string, point: { stockCode: string; date: string; time: string }): Promise<void> =>
    apiDelete(`tags/${tagId}/attachments`, { code: point.stockCode, date: point.date, time: point.time });

// ── 차트 부착 — 골격 분류용(타점 없는 차트도 대상). 사전은 위와 공유.
export const fetchChartTagAttachments = (signal?: AbortSignal): Promise<ChartTagAttachment[]> =>
    apiGet<ChartTagAttachment[]>("tags/chart-attachments", undefined, signal);

export const attachChartTag = (tagId: string, chart: { stockCode: string; date: string }): Promise<void> =>
    apiPost(`tags/${tagId}/chart-attachments`, chart);

export const detachChartTag = (tagId: string, chart: { stockCode: string; date: string }): Promise<void> =>
    apiDelete(`tags/${tagId}/chart-attachments`, { code: chart.stockCode, date: chart.date });
