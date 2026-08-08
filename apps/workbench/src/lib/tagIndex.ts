// 태그 부착 피드 → 타점별 조회 인덱스 + 낙관적 토글. 순수 파생(추가 fetch 0).
//  · 축(rankIndex)이 "줄 위 어디냐"를 다룬다면 여긴 "붙었냐/안 붙었냐"만 — 순서 없는 명목형이라 위치가 없다.
//  · tagIds 순서 = 서버가 준 순서(태그 이름순). 낙관적 삽입도 같은 기준으로 끼워 넣어야
//    부착 직후와 서버 응답 후의 칩 순서가 안 흔들린다(부착 순으로 붙이면 refetch 때 자리가 튄다).
import type { TagAttachment, ChartTagAttachment } from "@trade-data-manager/wire";
import { pointKey, chartKey, type PointKey, type PointRef } from "./pointKey.js";

/** pk("code|date|time") → 붙은 태그 id들(이름순). 태그 0개인 타점은 키가 없음. */
export type TagIndex = Map<PointKey, string[]>;

export function buildTagIndex(attachments: TagAttachment[]): TagIndex {
    const idx: TagIndex = new Map();
    for (const a of attachments) idx.set(pointKey(a), a.tagIds);
    return idx;
}

/** 차트키("code|date") → 차트 소유 태그 id들. 타점판과 같은 접기(부착 피드만 다르다). */
export function buildChartTagIndex(attachments: ChartTagAttachment[]): Map<string, string[]> {
    const idx = new Map<string, string[]>();
    for (const a of attachments) idx.set(chartKey(a), a.tagIds);
    return idx;
}

/** 태그별 사용 건수(삭제 확인 "N건에 붙어 있음" · 팔레트 빈도). 타점·차트 부착을 **합산**한다. */
export function countByTag(attachments: TagAttachment[], chartAttachments: ChartTagAttachment[] = []): Map<string, number> {
    const m = new Map<string, number>();
    for (const a of attachments) for (const id of a.tagIds) m.set(id, (m.get(id) ?? 0) + 1);
    for (const a of chartAttachments) for (const id of a.tagIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
}

/**
 * 프리셋(태그 **집합**) 토글 판정 — 숫자키 하나가 조합을 한 번에 다룬다.
 * 판정은 하나뿐이다: **프리셋 태그가 전부 붙어 있나.**
 *   전부 붙음 → 전부 뗀다(프리셋 밖 태그는 안 건드린다)
 *   아니면    → **빠진 것만** 채운다(이미 붙은 건 그대로 — 껐다 켜는 깜빡임이 없다)
 * 단일 태그 프리셋은 이것의 n=1 경우라 규칙이 하나로 유지된다.
 * 부분 상태에서 두 번 눌러야 비워지는 건 의도다("일단 이 조합을 다 달아라"가 주 용도).
 */
export function presetToggle(attached: readonly string[], preset: readonly string[]): { on: boolean; tagIds: string[] } {
    const has = new Set(attached);
    const missing = preset.filter((id) => !has.has(id));
    if (missing.length > 0) return { on: true, tagIds: missing };
    return { on: false, tagIds: preset.filter((id) => has.has(id)) };
}

/**
 * 낙관적 토글(차트판) — 타점판(applyTagToggle)과 같은 규칙: 같은 배열이면 그대로 반환, 빈 항목 안 남김,
 * 삽입은 이름순(서버 정렬과 동일 — refetch 때 칩 자리가 안 튄다).
 */
export function applyChartTagToggle(
    attachments: ChartTagAttachment[],
    chart: { stockCode: string; date: string },
    tagId: string,
    on: boolean,
    nameOf: (tagId: string) => string,
): ChartTagAttachment[] {
    const idx = attachments.findIndex((a) => a.stockCode === chart.stockCode && a.date === chart.date);
    if (!on) {
        if (idx < 0 || !attachments[idx].tagIds.includes(tagId)) return attachments;
        const tagIds = attachments[idx].tagIds.filter((id) => id !== tagId);
        if (tagIds.length === 0) return attachments.filter((_, i) => i !== idx);
        return attachments.map((a, i) => (i === idx ? { ...a, tagIds } : a));
    }
    if (idx < 0) return [...attachments, { stockCode: chart.stockCode, date: chart.date, tagIds: [tagId] }];
    if (attachments[idx].tagIds.includes(tagId)) return attachments;
    const tagIds = [...attachments[idx].tagIds, tagId].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return attachments.map((a, i) => (i === idx ? { ...a, tagIds } : a));
}

/**
 * 낙관적 토글 — 부착 피드에 한 태그를 붙이거나 뗀 결과(불변 갱신).
 * nameOf 는 정렬 기준(서버와 같은 이름순 유지). 태그가 0개가 된 타점은 항목째 제거(서버 표현과 동일).
 */
export function applyTagToggle(
    attachments: TagAttachment[],
    point: PointRef,
    tagId: string,
    on: boolean,
    nameOf: (tagId: string) => string,
): TagAttachment[] {
    const key = pointKey(point);
    const idx = attachments.findIndex((a) => pointKey(a) === key);

    // 바뀔 게 없으면 **같은 배열을 그대로** 돌려준다 — 내용만 같은 새 배열을 만들면 이걸 deps 로 삼은
    // useMemo(인덱스·건수)가 통째로 헛돈다(부착 수백 건이면 매 토글마다 재계산).
    if (!on) {
        if (idx < 0 || !attachments[idx].tagIds.includes(tagId)) return attachments;
        const tagIds = attachments[idx].tagIds.filter((id) => id !== tagId);
        if (tagIds.length === 0) return attachments.filter((_, i) => i !== idx); // 빈 항목 안 남김
        return attachments.map((a, i) => (i === idx ? { ...a, tagIds } : a));
    }

    if (idx < 0) return [...attachments, { stockCode: point.stockCode, date: point.date, time: point.time, tagIds: [tagId] }];
    if (attachments[idx].tagIds.includes(tagId)) return attachments; // 이미 붙음(멱등)
    const tagIds = [...attachments[idx].tagIds, tagId].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return attachments.map((a, i) => (i === idx ? { ...a, tagIds } : a));
}
