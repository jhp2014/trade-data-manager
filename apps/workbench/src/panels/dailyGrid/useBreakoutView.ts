// 격자판의 재료 — 포커스 종목·날짜의 돌파 사슬(그림용 궤적 포함)·사슬 봉 판정과, 그날 전 종목의 층별 수.
//
// 계산은 셀 엔진과 **같은 함수**(`breakoutOfStock` — 기준선 변환까지 그 안, `chainVerdicts` — 사슬 필터)다.
// 여기서 기준선 % 나 순번을 손으로 다시 계산하면 판의 ▼ 와 작업 대상 목록의 후보가 갈린다.
//
// 그날 전 종목 사슬은 **구조 노브(zigzag·밴드)가 바뀔 때만** 다시 세운다 — 사슬 필터를 만질 때는 그 위의
// 고르기만 다시 돈다(엔진의 구조 키 메모와 같은 나눔).
//
// 재료 가드(useCellSet 과 같은 규칙 — 컴파일러가 못 잡는다):
//   · 스냅샷이 **그 날짜의 것**일 때만 그린다(날짜를 넘긴 순간 옛 날짜 분봉을 새 날짜로 그리지 않게).
//   · 기준선 재료(/point-grids)가 오기 전엔 모른다 — 먼저 그리면 이름표가 뒤집힌다.
//   · 포커스 종목이 그날 분봉 유니버스 밖이면 빈 그림이 아니라 사유를 말한다.
import { useMemo } from "react";
import {
    breakoutKeyOf,
    breakoutOfStock,
    chainVerdicts,
    type BreakoutChainResult,
    type CellPredicate,
    type ChainVerdict,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { usePointGrids } from "../../lib/PointGridsContext.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";

type BreakoutPred = Extract<CellPredicate, { kind: "breakout" }>;

/** 그날 전 종목의 층별 수 — ② 사슬 · 사슬 봉 → ③ 후보(이 돌파 줄 단독 — 다른 AND 필터는 모른다, 그건 집합 수). */
export interface DayCounts { chains: number; bars: number; picked: number }

export type BreakoutView = {
    /** 재료 전이면 null, 재료 실패면 "error"(기다려도 안 온다 — 로딩으로 두면 옆의 집합 수와 다른 말을 한다).
     *  ⚠ 포커스 종목과 무관하다 — 종목을 안 짚어도 그날 수는 선다. */
    day: DayCounts | null | "error";
} & (
    | { status: "loading" }
    | { status: "empty"; why: string }
    | {
        status: "ready";
        stock: ReplayStock;
        res: BreakoutChainResult & { baselinePct: number | null };
        verdicts: ChainVerdict[];
        /** 그날 이 종목 거래 봉 수(① 격자가 서는 봉). */
        tradingBars: number;
    }
);

export function useBreakoutView(code: string, date: string, pred: BreakoutPred): BreakoutView {
    const snapQ = useDaySnapshot(date || null);
    const pointGrids = usePointGrids();
    const stocks = snapQ.data?.date === date ? snapQ.data.stocks : null;
    const byDate = pointGrids.byDate;
    const { zigzagPct, bandPct } = pred;
    const filterKey = breakoutKeyOf(pred);

    // 그날 전 종목 사슬 — 구조 노브가 바뀔 때만(400종목 × 720분, ms 급).
    const materialError = snapQ.error !== null || pointGrids.error !== null;
    const dayChains = useMemo(() => {
        if (materialError || !stocks || byDate === null) return null;
        return stocks.map((s) => ({ s, r: breakoutOfStock(s, pointGrids.gridOf(s.code, date)?.base ?? null, { zigzagPct, bandPct }) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialError, stocks, byDate, date, zigzagPct, bandPct]);

    const day = useMemo((): DayCounts | null | "error" => {
        if (materialError) return "error";
        if (dayChains === null) return null;
        let chains = 0;
        let bars = 0;
        let picked = 0;
        for (const { s, r } of dayChains) {
            chains += r.chains.length;
            bars += r.bars.length;
            for (const v of chainVerdicts(r.bars, s, pred.chain, pred.label)) if (v.picked) picked++;
        }
        return { chains, bars, picked };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialError, dayChains, filterKey]);

    // 포커스 종목 — 그림용 궤적을 켜서 따로 세운다(한 종목이라 싸다).
    const focused = useMemo(() => {
        if (!stocks || byDate === null || !code) return null;
        const stock = stocks.find((s) => s.code === code);
        if (!stock) return { stock: null } as const;
        const res = breakoutOfStock(stock, pointGrids.gridOf(code, date)?.base ?? null, { zigzagPct, bandPct }, { trace: true });
        let tradingBars = 0;
        for (let i = 0; i < stock.cumAmount.length; i++) if (stock.cumAmount[i] - (i > 0 ? stock.cumAmount[i - 1] : 0) > 0) tradingBars++;
        return { stock, res, tradingBars } as const;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, date, stocks, byDate, zigzagPct, bandPct]);

    return useMemo<BreakoutView>(() => {
        if (snapQ.error) return { day, status: "empty", why: `분봉 재료 조회 실패: ${(snapQ.error as Error).message}` };
        // 기준선 재료 실패 — 기다려도 안 온다. 로딩으로 두면 판이 영원히 "불러오는 중"이다.
        if (pointGrids.error) return { day, status: "empty", why: `기준선 재료(/point-grids) 조회 실패: ${pointGrids.error.message}` };
        if (!date || !code) return { day, status: "empty", why: "포커스 종목이 없습니다 — 차트나 작업 대상에서 종목을 짚으세요" };
        if (focused === null) return { day, status: "loading" };
        if (focused.stock === null) return { day, status: "empty", why: `${date} 에 이 종목의 분봉이 없습니다(그날 유니버스 밖)` };
        const verdicts = chainVerdicts(focused.res.bars, focused.stock, pred.chain, pred.label);
        return { day, status: "ready", stock: focused.stock, res: focused.res, verdicts, tradingBars: focused.tradingBars };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, date, focused, day, snapQ.error, pointGrids.error, filterKey]);
}
