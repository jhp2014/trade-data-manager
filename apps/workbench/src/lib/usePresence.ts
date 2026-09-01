// 큐레이션 존재 지도 훅 — **읽기 포트**. 소비자(작업셋·차트 헤더·보드)는 이 훅만 보고,
// 재료가 어디서 오는지(지금: 복제본 테이블 캐시 3개 + 클라 접기)는 여기 사유다.
// 나중에 어떤 질문이 커져 서버 접기로 되돌려야 하면 이 파일 안만 바꾼다 — 소비자는 무지.
//
// 인스턴스마다 지도 전체를 다시 접지만(useMemo), 사람 편집 규모(수만 행)라 편집당 ms 수준이고
// 소비 화면도 서넛이다 — GroupsProvider 처럼 컨텍스트로 올릴 필요가 생기면 그때(선례가 이미 있다).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { allAnchorsQuery, allCommentsQuery, groupMembershipsQuery } from "../api/queries.js";
import { buildPresenceIndex, type DayPresence } from "./presence.js";
import { chartKeyOf } from "./pointKey.js";

export interface PresenceView {
    /** chartKey("code|date") → 존재 요약. */
    index: ReadonlyMap<string, DayPresence>;
    isLoading: boolean;
    /** 첫 로드 실패(테이블 하나라도) — 작업셋이 빈 목록을 "없음"으로 오독하지 않게 겉으로 낸다. */
    error: Error | null;
}

/** 지도 전체 — 작업셋 목록·월 브라우징처럼 모수가 필요한 소비자용. */
export function usePresenceIndex(): PresenceView {
    const anchorsQ = useQuery(allAnchorsQuery());
    const memberQ = useQuery(groupMembershipsQuery());
    const commentsQ = useQuery(allCommentsQuery());

    const index = useMemo(
        () => buildPresenceIndex(anchorsQ.data ?? [], memberQ.data ?? [], commentsQ.data ?? []),
        [anchorsQ.data, memberQ.data, commentsQ.data],
    );
    return useMemo(
        () => ({
            index,
            isLoading: anchorsQ.isLoading || memberQ.isLoading || commentsQ.isLoading,
            error: (anchorsQ.error ?? memberQ.error ?? commentsQ.error) as Error | null,
        }),
        [index, anchorsQ.isLoading, memberQ.isLoading, commentsQ.isLoading, anchorsQ.error, memberQ.error, commentsQ.error],
    );
}

/** 한 차트(종목,날짜)의 존재 요약 — 차트 헤더 배지용. 흔적이 하나도 없으면 null. */
export function usePresenceOf(stockCode: string, date: string): DayPresence | null {
    const { index } = usePresenceIndex();
    return stockCode && date ? (index.get(chartKeyOf(stockCode, date)) ?? null) : null;
}
