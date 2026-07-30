// 타점 태그 한 벌 — 차트 카드·타점 정보 패널·태그 메뉴·(후속) 시트/필터가 공유한다.
// 사전(tags)과 부착(attachments)을 늘 같이 쓰므로 훅 하나로 준다(팔레트 = 사전 + 빈도).
//
// 토글이 **낙관적**인 이유: 차트에서 숫자키를 연타하는 입력이라 왕복을 기다리면 눌린 게 늦게 보이고,
// 매 요청마다 invalidate 하면 연타 중 refetch 가 겹쳐 화면이 되돌아가는 깜빡임이 난다.
// → 캐시를 먼저 고치고, **마지막 요청이 끝났을 때만** 서버와 맞춘다(비행 중인 게 남았으면 건너뜀).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tag, TagAttachment } from "../api/tags.js";
import { attachTag, detachTag } from "../api/tags.js";
import { tagsQuery, tagAttachmentsQuery } from "../api/queries.js";
import { applyTagToggle, buildTagIndex, countByTag } from "./tagIndex.js";
import { pointKey, type PointRef } from "./pointKey.js";

const TOGGLE_KEY = ["tag-toggle"];

export interface TagsView {
    /** 태그 사전(이름 오름차순 — 서버 정렬 그대로). */
    tags: Tag[];
    /** id → 태그(프리셋 슬롯이 id 를 들고 있어 이름을 되찾을 때). 없는 id = 지워진 태그. */
    tagById: Map<string, Tag>;
    /** 이 타점에 붙은 태그(이름순). */
    tagsOf: (point: PointRef) => Tag[];
    has: (point: PointRef, tagId: string) => boolean;
    /** 이 태그가 붙은 타점 수(삭제 확인·팔레트 빈도). */
    countOf: (tagId: string) => number;
    /** 부착 토글(낙관적). on 생략 = 현재 상태의 반대. */
    toggle: (point: PointRef, tagId: string, on?: boolean) => void;
    isLoading: boolean;
}

export function useTags(): TagsView {
    const qc = useQueryClient();
    const tagsQ = useQuery(tagsQuery());
    const attQ = useQuery(tagAttachmentsQuery());

    const tags = useMemo(() => tagsQ.data ?? [], [tagsQ.data]);
    const attachments = useMemo(() => attQ.data ?? [], [attQ.data]);
    const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
    const index = useMemo(() => buildTagIndex(attachments), [attachments]);
    const counts = useMemo(() => countByTag(attachments), [attachments]);

    const attKey = tagAttachmentsQuery().queryKey;
    const toggleMut = useMutation({
        mutationKey: TOGGLE_KEY,
        mutationFn: ({ point, tagId, on }: { point: PointRef; tagId: string; on: boolean }) =>
            on ? attachTag(tagId, point) : detachTag(tagId, point),
        onMutate: ({ point, tagId, on }) => {
            const nameOf = (id: string): string => tagById.get(id)?.name ?? id;
            qc.setQueryData<TagAttachment[]>(attKey, (cur) => applyTagToggle(cur ?? [], point, tagId, on, nameOf));
        },
        // 실패·성공 모두 마지막 한 건에서만 서버와 동기(연타 중엔 낙관적 상태 유지).
        onSettled: () => {
            if (qc.isMutating({ mutationKey: TOGGLE_KEY }) <= 1) void qc.invalidateQueries({ queryKey: attKey });
        },
    });

    return useMemo(() => {
        const idsOf = (p: PointRef): string[] => index.get(pointKey(p)) ?? [];
        return {
            tags,
            tagById,
            tagsOf: (p) => idsOf(p).map((id) => tagById.get(id)).filter((t): t is Tag => t != null),
            has: (p, tagId) => idsOf(p).includes(tagId),
            countOf: (tagId) => counts.get(tagId) ?? 0,
            toggle: (p, tagId, on) => toggleMut.mutate({ point: p, tagId, on: on ?? !idsOf(p).includes(tagId) }),
            isLoading: tagsQ.isLoading || attQ.isLoading,
        };
        // toggleMut 은 매 렌더 새 객체(useMutation) — 의존성에 넣으면 매번 재생성되므로 제외(mutate 는 안정).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tags, tagById, index, counts, tagsQ.isLoading, attQ.isLoading]);
}
