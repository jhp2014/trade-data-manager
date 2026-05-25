"use client";

import { useQuery } from "@tanstack/react-query";
import {
    fetchPeerListAction,
    type PeerListSnapshotDTO,
} from "@/actions/peerList";

export interface UsePeerListSnapshotParams {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
    themeId: string;
}

/**
 * 특정 테마의 멤버 스냅샷을 가져오는 React Query 훅.
 *
 *  - ChartModal 헤더 chip → PeerListModal 진입
 *  - PeerListModal 시간 슬라이더 변경
 *
 * 둘 다 같은 query key 를 공유하므로 같은 (themeId, date, time, stock) 은
 * 자동 캐싱된다.
 */
export function usePeerListSnapshot(params: UsePeerListSnapshotParams | null) {
    return useQuery<PeerListSnapshotDTO>({
        queryKey: [
            "peer-list",
            params?.themeId,
            params?.tradeDate,
            params?.tradeTime,
            params?.stockCode,
        ],
        queryFn: async () => {
            const res = await fetchPeerListAction(params!);
            if (!res.ok) throw new Error(res.error);
            return res.data;
        },
        enabled: params !== null,
        staleTime: Infinity,
    });
}
