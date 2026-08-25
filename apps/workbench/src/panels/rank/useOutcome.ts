// 결과(outcome) 저장 + 후보 목록 — 시트의 결과 입력 메뉴가 쓴다.
// (옛 useAxisAdmin 의 축 CRUD 는 2026-08-25 판단축 폐지로 삭제 — 결과 저장만 남아 이름을 바꿨다.)
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { allPointsQuery } from "../../api/queries.js";
import { upsertReviewPoint } from "../../api/reviewPoints.js";
import type { ReviewPoint } from "@trade-data-manager/wire";
import type { SheetRow } from "./rankSheet.js";

export interface OutcomeAdmin {
    saveOutcome: (row: SheetRow, outcome: string) => void;
    /** 지금까지 쓴 결과 값들(빈도순) — 결과 입력 메뉴의 후보. */
    outcomeChoices: string[];
}

export function useOutcome(allPoints: readonly ReviewPoint[]): OutcomeAdmin {
    const qc = useQueryClient();
    /**
     * 결과(outcome) 저장 — upsert 는 타점을 통째로 덮으므로 **memo 를 같이 실어 보낸다**.
     * 안 그러면 결과를 적는 순간 메모가 조용히 지워진다.
     */
    const outcomeMut = useMutation({
        // 결과는 타점의 속성 — day 행(시각 없음)은 결과 열 자체가 없어 여기 못 온다(타입 가드만 남긴다).
        mutationFn: (v: { row: SheetRow & { time: string }; outcome: string }) =>
            upsertReviewPoint({ stockCode: v.row.stockCode, date: v.row.date, time: v.row.time, outcome: v.outcome || undefined, memo: v.row.memo }),
        onSuccess: () => void qc.invalidateQueries({ queryKey: allPointsQuery().queryKey }),
    });
    /** 지금까지 쓴 결과 값들(빈도순) — 허용값이 코드가 아니라 사람이 적는 말이라, 목록을 **데이터에서** 모은다. */
    const outcomeChoices = useMemo(() => {
        const n = new Map<string, number>();
        for (const p of allPoints) if (p.outcome) n.set(p.outcome, (n.get(p.outcome) ?? 0) + 1);
        return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    }, [allPoints]);

    return {
        saveOutcome: (row, outcome) => { if (row.time !== undefined) outcomeMut.mutate({ row: row as SheetRow & { time: string }, outcome }); },
        outcomeChoices,
    };
}
