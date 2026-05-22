import { create } from "zustand";
import type { ThemeRowData, StockMetricsDTO } from "@/types/deck";

/**
 * 펼침 영역(테마 peer / Active 풀)을 모달로 표시하기 위한 store.
 *
 * 가상화 환경에서 row 의 펼침이 동적 높이를 만들면 virtualizer 의
 * measureElement 가 매우 까다로워지므로, 펼침 자체를 별도 모달로 옮긴다.
 */
export type PeerListKind = "theme" | "active";

export interface PeerListEntry {
    /** 표시 순서대로 1-based rank */
    rank: number;
    member: StockMetricsDTO;
    isSelf: boolean;
}

export interface PeerListModalTarget {
    kind: PeerListKind;
    /** 모달 헤더 라벨 (e.g. "#반도체  5/12 종목" / "Act#1: ... 통과 8종목") */
    headerLabel: string;
    /** 본인 포함, 표시 순서대로 정렬된 row 들 */
    entries: PeerListEntry[];
    /** row 본문의 메타 정보 (차트 모달 호출 시 사용) */
    tradeDate: string;
    tradeTime: string;
    themeId: string;
    /** 옵션 컬럼이 보이는지 여부 (peer row 의 grid 정합성용) */
    hasOptions: boolean;
    /** 호출한 원본 row 의 식별 정보 (필요 시 재진입 등에 사용) */
    sourceRow: {
        stockCode: string;
        themeId: string;
        tradeDate: string;
        tradeTime: string;
    };
}

interface PeerListModalState {
    target: PeerListModalTarget | null;
    open: (t: PeerListModalTarget) => void;
    close: () => void;
}

export const usePeerListModalStore = create<PeerListModalState>((set) => ({
    target: null,
    open: (target) => set({ target }),
    close: () => set({ target: null }),
}));

/* -------------------------------------------------------------- *
 * Helper: ThemeRowData → PeerListEntry[] 생성
 *
 *  - kind === "theme":
 *      row.peers 는 self 제외 / 등락률 순서. self 를 selfRank 위치에
 *      삽입하여 본인 포함 정렬 배열을 만든다.
 *
 *  - kind === "active":
 *      ActivePool.members 는 이미 self 를 포함한 등락률 정렬 배열.
 *      그대로 매핑하면 된다.
 * -------------------------------------------------------------- */

export function buildThemeEntries(row: ThemeRowData): PeerListEntry[] {
    const out: PeerListEntry[] = [];
    const selfRank = row.selfRank;
    let peerIdx = 0;
    for (let rank = 1; rank <= row.themeSize; rank++) {
        if (rank === selfRank) {
            out.push({ rank, member: row.self, isSelf: true });
        } else {
            const peer = row.peers[peerIdx++];
            if (!peer) break;
            out.push({ rank, member: peer, isSelf: false });
        }
    }
    return out;
}

export function buildActiveEntries(
    selfStockCode: string,
    members: StockMetricsDTO[],
): PeerListEntry[] {
    return members.map((m, i) => ({
        rank: i + 1,
        member: m,
        isSelf: m.stockCode === selfStockCode,
    }));
}
