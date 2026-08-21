// 후보 하루(분석의 모수) — **읽기 포트**. 재료는 존재 지도(복제본 테이블 4개의 접기)이고 파생은
// 순수 함수 candidateDaysOf(lib/presence.ts — 정의·정렬·코멘트 제외 규칙이 전부 거기 한 곳).
// 옛 GET /candidate-days(서버 union)를 흡수하며 은퇴시킨 자리 — 소비자(깔때기 분모·레일 척도)는
// 재료가 복제본인지 서버인지 모른다.
import { useMemo } from "react";
import type { ChartRef } from "@trade-data-manager/market/domain";
import { usePresenceIndex } from "./usePresence.js";
import { candidateDaysOf } from "./presence.js";

export interface CandidateDaysView {
    /** 날짜 내림차순 → 종목 오름차순(파생이 고정 — 화면마다 안 흔들리게). */
    candidates: ChartRef[];
    isLoading: boolean;
}

export function useCandidateDays(): CandidateDaysView {
    const { index, isLoading } = usePresenceIndex();
    const candidates = useMemo(() => candidateDaysOf(index), [index]);
    return useMemo(() => ({ candidates, isLoading }), [candidates, isLoading]);
}
