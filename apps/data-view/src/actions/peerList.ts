"use server";

import {
    getThemeSnapshotAt,
    STAT_AMOUNTS,
} from "@trade-data-manager/data-core";
import type { StockMetricsDTO } from "@/types/deck";
import { toStockMetricsDTO } from "@/lib/snapshotMapper";
import { sortByCloseRateDesc } from "@/lib/sort/sortByCloseRateDesc";
import { getDb } from "./db";
import { type Result, okResult, errResult } from "@/lib/result";

/* ===========================================================
 * fetchPeerListAction
 *
 * (stockCode, tradeDate, tradeTime, themeId) 로 특정 테마의 멤버 스냅샷을
 * 가져와 PeerListModal 이 그대로 렌더할 수 있는 형태로 변환한다.
 *
 *  - ChartModal 헤더의 테마 chip 클릭 진입 (명세 #3)
 *  - PeerListModal 의 시간 슬라이더 변경 (명세 #4)
 *
 * 두 진입점에서 동일 server action / React Query 키를 공유한다.
 * =========================================================== */

export interface PeerListSnapshotDTO {
    themeId: string;
    themeName: string;
    /**
     * self 포함, closeRate 내림차순 정렬.
     * carry-forward 이후에도 feature 가 채워지지 않은 멤버(그날 첫 거래 전 등)는
     * closeRate=null 로 맨 뒤에 위치.
     */
    members: StockMetricsDTO[];
    /** self 종목 코드. 본인 row 강조용. self 가 그 시점 스냅샷에 없으면 null. */
    selfStockCode: string | null;
    /** self 종목 이름. 강조 표시 등에 사용. self 가 없으면 null. */
    selfStockName: string | null;
}

export async function fetchPeerListAction(params: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
    themeId: string;
}): Promise<Result<{ data: PeerListSnapshotDTO }>> {
    try {
        const db = getDb();
        const snapshots = await getThemeSnapshotAt(db, {
            stockCode: params.stockCode,
            tradeDate: params.tradeDate,
            tradeTime: params.tradeTime,
        });

        const snap = snapshots.find((s) => s.themeId === params.themeId);
        if (!snap) {
            return okResult({
                data: {
                    themeId: params.themeId,
                    themeName: "",
                    members: [],
                    selfStockCode: null,
                    selfStockName: null,
                },
            });
        }

        // carry-forward (data-core 단에서 처리) 후에도 feature 가 null 인 멤버는
        // 그날 첫 거래 전 케이스이므로 closeRate=null 로 매핑되어 정렬상 맨 뒤로 밀린다.
        // See: docs/decisions/018-carry-forward-vi-feature.md
        const mapped = snap.members.map((m) => toStockMetricsDTO(m, STAT_AMOUNTS));
        const members: StockMetricsDTO[] = sortByCloseRateDesc(mapped);

        const selfDto = members.find((m) => m.stockCode === params.stockCode) ?? null;

        return okResult({
            data: {
                themeId: snap.themeId,
                themeName: snap.themeName,
                members,
                selfStockCode: selfDto?.stockCode ?? null,
                selfStockName: selfDto?.stockName ?? null,
            },
        });
    } catch (err) {
        return errResult(err);
    }
}
