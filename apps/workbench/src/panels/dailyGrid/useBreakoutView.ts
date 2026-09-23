// 격자판의 재료 — 포커스 종목·날짜의 돌파 사슬(그림용 궤적 포함)과 그날 전 종목 생성기 수.
//
// 계산은 셀 엔진과 **같은 함수**(`breakoutOfStock` — 기준선 변환까지 그 안)다. 여기서 기준선 % 를 손으로
// 다시 옮기면 판의 ▼ 와 작업 대상 목록의 후보가 갈린다.
//
// 재료 가드(useCellSet 과 같은 규칙 — 컴파일러가 못 잡는다):
//   · 스냅샷이 **그 날짜의 것**일 때만 그린다(날짜를 넘긴 순간 옛 날짜 분봉을 새 날짜로 그리지 않게).
//   · 기준선 재료(/point-grids)가 오기 전엔 모른다 — 먼저 그리면 이름표가 뒤집힌다.
//   · 포커스 종목이 그날 분봉 유니버스 밖이면 빈 그림이 아니라 사유를 말한다.
import { useMemo } from "react";
import {
    breakoutOfStock,
    type BreakoutChainKnobs,
    type BreakoutChainResult,
    type BreakoutLabelFilter,
} from "@trade-data-manager/market/domain";
import type { ReplayStock } from "../../api/dayReplay.js";
import { usePointGrids } from "../../lib/PointGridsContext.js";
import { useDaySnapshot } from "../../lib/useDaySnapshot.js";

export type BreakoutView = {
    /** 그날 전 종목 생성기 후보 수(이름표 거르기 적용) — 다른 AND 필터는 모른다(그건 집합 수). 재료 전이면 null,
     *  재료 실패면 "error"(기다려도 안 온다 — 로딩으로 두면 옆의 집합 수와 다른 말을 한다).
     *  ⚠ 포커스 종목과 무관하다 — 종목을 안 짚어도 그날 수는 선다. */
    dayTotal: number | null | "error";
} & (
    | { status: "loading" }
    | { status: "empty"; why: string }
    | { status: "ready"; stock: ReplayStock; res: BreakoutChainResult & { baselinePct: number | null } }
);

export function useBreakoutView(code: string, date: string, knobs: BreakoutChainKnobs & { label: BreakoutLabelFilter }): BreakoutView {
    const snapQ = useDaySnapshot(date || null);
    const pointGrids = usePointGrids();
    const stocks = snapQ.data?.date === date ? snapQ.data.stocks : null;
    const byDate = pointGrids.byDate;
    const { zigzagPct, bandPct, label } = knobs;

    // 그날 전 종목 — 노브가 바뀔 때만 다시 센다(400종목 × 720분, ms 급).
    const materialError = snapQ.error !== null || pointGrids.error !== null;
    const dayTotal = useMemo((): number | null | "error" => {
        if (materialError) return "error";
        if (!stocks || byDate === null) return null;
        let n = 0;
        for (const s of stocks) {
            const r = breakoutOfStock(s, pointGrids.gridOf(s.code, date)?.base ?? null, { zigzagPct, bandPct });
            for (const c of r.candidates) if (label === "all" || c.label === label) n++;
        }
        return n;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialError, stocks, byDate, date, zigzagPct, bandPct, label]);

    return useMemo<BreakoutView>(() => {
        if (snapQ.error) return { dayTotal, status: "empty", why: `분봉 재료 조회 실패: ${(snapQ.error as Error).message}` };
        // 기준선 재료 실패 — 기다려도 안 온다. 로딩으로 두면 판이 영원히 "불러오는 중"이다.
        if (pointGrids.error) return { dayTotal, status: "empty", why: `기준선 재료(/point-grids) 조회 실패: ${pointGrids.error.message}` };
        if (!date || !code) return { dayTotal, status: "empty", why: "포커스 종목이 없습니다 — 차트나 작업 대상에서 종목을 짚으세요" };
        if (!stocks || byDate === null) return { dayTotal, status: "loading" };
        const stock = stocks.find((s) => s.code === code);
        if (!stock) return { dayTotal, status: "empty", why: `${date} 에 이 종목의 분봉이 없습니다(그날 유니버스 밖)` };
        const res = breakoutOfStock(stock, pointGrids.gridOf(code, date)?.base ?? null, { zigzagPct, bandPct }, { trace: true });
        return { dayTotal, status: "ready", stock, res };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, date, stocks, byDate, dayTotal, snapQ.error, pointGrids.error, zigzagPct, bandPct]);
}
