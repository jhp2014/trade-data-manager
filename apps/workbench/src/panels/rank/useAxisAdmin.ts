// ── 축 관리(만들기·이름 변경·삭제) + 결과(outcome) 저장 — 배치 보드가 사라져 시트가 유일한 입구다.
// 전부 서버 뮤테이션 + 캐시 무효화 배선이라 한 훅으로 묶었다(표를 그리는 본체와 성격이 다르다).
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { allPointsQuery, axisLinesQuery, rankAxesQuery } from "../../api/queries.js";
import { createRankAxis, deleteRankAxis, renameRankAxis } from "../../api/rank.js";
import { upsertReviewPoint } from "../../api/reviewPoints.js";
import { placedAxisKey, placedAxisName } from "../../lib/computedAxis.js";
import type { ReviewPoint } from "@trade-data-manager/wire";
import type { SheetRow } from "./rankSheet.js";

export interface AxisAdmin {
    createAxis: (name: string, scope: "point" | "day") => void;
    renameAxis: (id: string, name: string) => void;
    deleteAxis: (id: string) => void;
    saveOutcome: (row: SheetRow, outcome: string) => void;
    /** 지금까지 쓴 결과 값들(빈도순) — 결과 입력 메뉴의 후보. */
    outcomeChoices: string[];
}

export function useAxisAdmin({ migrateAxisKey, allPoints }: {
    /**
     * 열 키(`ax:p:<이름>`)에 이름이 들어 있어 rename 은 곧 키 변경이다 — 고정·숨김·폭·컷·축 순서의
     * 이관 손잡이(useSheetColumns.migrateAxisKey)를 받아 **invalidate 앞에** 부른다.
     */
    migrateAxisKey: (oldAxisId: string, newAxisId: string) => void;
    allPoints: readonly ReviewPoint[];
}): AxisAdmin {
    const qc = useQueryClient();
    const invAxes = (): void => void qc.invalidateQueries({ queryKey: rankAxesQuery().queryKey });
    const invLines = (): void => void qc.invalidateQueries({ queryKey: axisLinesQuery().queryKey });
    const createAxisMut = useMutation({ mutationFn: (v: { name: string; scope: "point" | "day" }) => createRankAxis(v.name, v.scope), onSuccess: invAxes });
    const renameAxisMut = useMutation({
        // 서버 정체성은 raw 이름 — 클라 키(`p:<이름>`)를 그대로 보내면 무음 no-op 이 된다.
        mutationFn: (v: { id: string; name: string }) => renameRankAxis(placedAxisName(v.id), v.name),
        // 키 이관을 **invalidate 앞에** — 새 축 목록이 먼저 오면 청소(prune)가 옛 키를 유령으로 지워 버린다.
        onSuccess: (_d, v) => { migrateAxisKey(v.id, placedAxisKey(v.name)); invAxes(); },
    });
    // 축이 사라지면 그 줄도 함께 사라진다 — 줄 캐시까지 무효화해야 열이 유령으로 안 남는다.
    const deleteAxisMut = useMutation({ mutationFn: (id: string) => deleteRankAxis(placedAxisName(id)), onSuccess: () => { invAxes(); invLines(); } });

    /**
     * 결과(outcome) 저장 — upsert 는 타점을 통째로 덮으므로 **memo 를 같이 실어 보낸다**.
     * 안 그러면 결과를 적는 순간 메모가 조용히 지워진다.
     */
    const outcomeMut = useMutation({
        mutationFn: (v: { row: SheetRow; outcome: string }) =>
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
        createAxis: (name, scope) => createAxisMut.mutate({ name, scope }),
        renameAxis: (id, name) => renameAxisMut.mutate({ id, name }),
        deleteAxis: (id) => deleteAxisMut.mutate(id),
        saveOutcome: (row, outcome) => outcomeMut.mutate({ row, outcome }),
        outcomeChoices,
    };
}
