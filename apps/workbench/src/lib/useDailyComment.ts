// 그 (날짜,종목)의 당일 코멘트 — **읽기 포트**(팝업 프리필용). 재료는 큐레이션 복제본(all-comments
// 테이블 키). 저장 mutation 이 all-comments 를 invalidate 하므로(AssignThemeModal) 프리필은 항상 최신이고,
// 옛 per-chart GET(staleTime 0 재조회)과 의미가 같다 — 서버 읽기도 같은 로컬 미러였다.
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DailyCommentListItem } from "../api/comment.js";
import { allCommentsQuery } from "../api/queries.js";

/** 없으면 null(빈 칸으로 연다). isLoaded 는 테이블 도착 여부 — 프리필 1회 트리거용. */
export function useDailyComment(date: string, code: string): { comment: DailyCommentListItem | null; isLoaded: boolean } {
    const select = useCallback(
        (all: DailyCommentListItem[]) => all.find((c) => c.date === date && c.stockCode === code) ?? null,
        [date, code],
    );
    const q = useQuery({ ...allCommentsQuery(), select });
    return { comment: q.data ?? null, isLoaded: q.isSuccess };
}
