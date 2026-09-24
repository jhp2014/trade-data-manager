// 격자판의 재료 — 포커스 종목·날짜의 사슬 판정과 그날 전 종목의 층별 수(그림은 기본 차트의 사슬 층이 그린다).
//
// 계산은 셀 엔진과 **같은 함수**(`breakoutOfStock` — 기준선 변환까지 그 안, `chainVerdicts` — 사슬 필터 식)다.
// 여기서 기준선 % 나 순번을 손으로 다시 계산하면 판의 수와 작업 대상 목록의 후보가 갈린다.
//
// 그날 전 종목 사슬은 **① 격자(zigzag·밴드)가 바뀔 때만** 다시 세운다 — ② 사슬 필터를 만질 때는 그 위의
// 판정만 다시 돈다(엔진의 구조 키 메모와 같은 나눔).
//
// 재료 가드(useCellSet 과 같은 규칙):
//   · 스냅샷이 **그 날짜의 것**일 때만 센다.
//   · 기준선 재료(/point-grids)가 오기 전엔 모른다 — 먼저 세면 이름표 조건이 뒤집힌다.
import { useMemo } from "react";
import {
    breakoutKeyOf,
    breakoutOfStock,
    chainVerdicts,
    type CellPredicate,
    type ChainVerdict,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { usePointGrids } from "../../lib/PointGridsContext.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

/** 층별 수 — ① 거래 봉 → ② 사슬·사슬 봉 → 후보(이 돌파 줄 단독 — 다른 AND 조건은 모른다, 그건 집합 수). */
export interface LayerCounts { chains: number; bars: number; picked: number }

export type BreakoutView = {
    /** 그날 전 종목 — 재료 전이면 null, 재료 실패면 "error". 포커스 종목과 무관하다. */
    day: LayerCounts | null | "error";
} & (
    | { status: "loading" }
    | { status: "empty"; why: string }
    | { status: "ready"; stock: ReplayStock; counts: LayerCounts; verdicts: ChainVerdict[] }
);

export function useBreakoutView(code: string, date: string, pred: BreakoutPred): BreakoutView {
    const snapQ = useDaySnapshot(date || null);
    const pointGrids = usePointGrids();
    const stocks = snapQ.data?.date === date ? snapQ.data.stocks : null;
    const byDate = pointGrids.byDate;
    const { zigzagPct, bandPct } = pred;
    const filterKey = breakoutKeyOf(pred);
    const materialError = snapQ.error !== null || pointGrids.error !== null;

    const dayChains = useMemo(() => {
        if (materialError || !stocks || byDate === null) return null;
        return stocks.map((s) => ({ s, r: breakoutOfStock(s, pointGrids.gridOf(s.code, date)?.base ?? null, { zigzagPct, bandPct }) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialError, stocks, byDate, date, zigzagPct, bandPct]);

    const judged = useMemo(() => {
        if (dayChains === null) return null;
        let chains = 0;
        let bars = 0;
        let picked = 0;
        const byCode = new Map<string, { counts: LayerCounts; verdicts: ChainVerdict[] }>();
        for (const { s, r } of dayChains) {
            const verdicts = chainVerdicts(r.bars, s, pred.chain);
            const p = verdicts.reduce((n, v) => n + (v.picked ? 1 : 0), 0);
            chains += r.chains.length;
            bars += r.bars.length;
            picked += p;
            byCode.set(s.code, { counts: { chains: r.chains.length, bars: r.bars.length, picked: p }, verdicts });
        }
        return { day: { chains, bars, picked }, byCode };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dayChains, filterKey]);

    return useMemo<BreakoutView>(() => {
        const day = materialError ? "error" : judged?.day ?? null;
        if (snapQ.error) return { day, status: "empty", why: `분봉 재료 조회 실패: ${(snapQ.error as Error).message}` };
        if (pointGrids.error) return { day, status: "empty", why: `기준선 재료(/point-grids) 조회 실패: ${pointGrids.error.message}` };
        if (!date || !code) return { day, status: "empty", why: "포커스 종목이 없습니다 — 차트나 작업 대상에서 종목을 짚으세요" };
        if (!stocks || judged === null) return { day, status: "loading" };
        const stock = stocks.find((s) => s.code === code);
        const mine = judged.byCode.get(code);
        if (!stock || !mine) return { day, status: "empty", why: `${date} 에 이 종목의 분봉이 없습니다(그날 유니버스 밖)` };
        return { day, status: "ready", stock, counts: mine.counts, verdicts: mine.verdicts };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, date, stocks, judged, materialError, snapQ.error, pointGrids.error]);
}
