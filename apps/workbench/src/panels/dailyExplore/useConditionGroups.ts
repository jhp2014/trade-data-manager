// 조건 그룹(탐색판이 고른 저장 집합 ≤5)의 **평가 한 벌** — 탐색판(열 ●/·)과 기본 차트(고스트 칩)가
// 같은 이 훅을 쓴다(두 벌이면 판과 차트가 다른 그룹·다른 판정을 말한다).
//
// ## 선택의 주인은 탐색판 하나다
// 그룹 선택은 `panelUi["daily-explore-1"].exploreGroups` — 탐색판이 **단일 인스턴스**라서(카탈로그
// duplicable 아님 — w/s 소유가 패널당 1개 전제) 차트가 판 없이도 같은 저장물을 읽으면 된다.
// null = 자동(보는 집합의 최상위 참조 부품을 따라간다).
//
// ## 비용
// 그룹마다 그날 평가 한 벌(0.25~0.47초, 날짜당 한 번) — 캐시 선반(useCellSet MEMO_CAP 12)에 남아
// 탐색판과 차트가 같은 키를 나눠 쓴다(둘이 켜져 있어도 평가는 한 번).
import { useCallback, useMemo } from "react";
import type { CellEvalOptions } from "@trade-data-manager/market/domain";
import { useWorkbench, selectObservedSetId } from "../../store/workbench.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { useCellSet } from "../filter/useCellSet.js";
import { setDisplayName } from "../filter/label.js";
import type { SetExpr } from "../filter/expr.js";
import { MAX_GROUPS, autoGroupIds, groupColStateOf, type GroupColState } from "./exploreRows.js";

/** 탐색판의 단일 인스턴스 주소 — 그룹 선택 저장물이 여기 산다(카탈로그 duplicable 아님이 전제). */
export const EXPLORE_PANEL_ID = "daily-explore-1";

/**
 * 그룹 멤버십 평가의 옵션 — **목록이 아니라 진릿값**이라 상한(300)을 안 건다(그물 50,000만 남긴다).
 * 2026-09-26 실측: 상한을 걸면 넓은 그룹이 종목째 잘려 ● 이 통째로 어긋난다(첫 판은 전 열이 "—"였다).
 * 보는 집합(행 목록)은 계속 DAY_SET_OPTS — 그건 하류(목록·순회)를 보호하는 산출물 상한이다.
 */
const GROUP_OPTS: CellEvalOptions = { limit: 50_000 };

/** 그룹 열 색 — 자리(0~4) 고정. 종류색과 겹치지 않게 중간 채도로 다섯. */
export const GROUP_COLORS = ["#1d9e75", "#7f77dd", "#ba7517", "#2f7fd0", "#c2557e"] as const;

export interface GroupCol {
    setId: string;
    name: string;
    color: string;
    state: GroupColState;
}

export function useConditionGroups(date: string, active: boolean): {
    picked: string[] | null;
    setPicked: (next: string[] | null) => void;
    groupSets: readonly { id: string; expr: SetExpr; universe: string }[];
    groupCols: GroupCol[];
    groupName: (setId: string) => string;
} {
    const funnel = useFunnel();
    const savedSets = useWorkbench((s) => s.savedSets);
    const observedId = useWorkbench(selectObservedSetId);

    // ── 저장물은 고른 id 목록 하나(null = 자동: 보는 집합의 최상위 참조 항).
    const [picked, setPicked] = usePanelUi<string[] | null>(EXPLORE_PANEL_ID, "exploreGroups", null);
    // ⚠ 그룹 식은 **늦은 한 벌**(slowSets)에서 — 행·◇ 와 같은 박자여야 하고, 살아 있는 savedSets 를 쓰면
    //   조건판에서 그룹 집합을 만지는 키스트로크마다 전 시장 평가(0.25~0.47초)가 돈다(리뷰가 잡은 자리).
    const observedExpr = useMemo<SetExpr | null>(() => funnel.slowSets.find((x) => x.id === observedId)?.expr ?? null, [funnel.slowSets, observedId]);
    const groupSets = useMemo(() => {
        const ids = picked ?? (observedExpr ? autoGroupIds(observedExpr) : []);
        return ids.map((id) => funnel.slowSets.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => x !== undefined && x.universe === "daily").slice(0, MAX_GROUPS);
    }, [picked, observedExpr, funnel.slowSets]);
    const groupName = useCallback(
        (setId: string): string => {
            const f = savedSets.find((x) => x.id === setId);
            return f ? setDisplayName(f, funnel.labelLook, (id) => savedSets.find((x) => x.id === id)?.name ?? "(묶음)") : "(지워진 집합)";
        },
        [savedSets, funnel.labelLook],
    );

    // 훅은 개수가 고정이어야 한다 — 그룹 칸 5개를 늘 부르고, 빈 칸은 null 식(재료를 안 당긴다).
    // ⚠ `active` 가 꺼진 동안도 안 돈다 — 탐색판은 행이 없는 날(빈 날 자동 스킵), 차트는 드리프트를 끈다.
    const gx = (i: number): SetExpr | null => (active ? groupSets[i]?.expr ?? null : null);
    const g0 = useCellSet(gx(0), funnel.slowSets, date, GROUP_OPTS);
    const g1 = useCellSet(gx(1), funnel.slowSets, date, GROUP_OPTS);
    const g2 = useCellSet(gx(2), funnel.slowSets, date, GROUP_OPTS);
    const g3 = useCellSet(gx(3), funnel.slowSets, date, GROUP_OPTS);
    const g4 = useCellSet(gx(4), funnel.slowSets, date, GROUP_OPTS);
    const groupCols = useMemo<GroupCol[]>(() => {
        const evals = [g0, g1, g2, g3, g4];
        return groupSets.map((f, i) => ({ setId: f.id, name: groupName(f.id), color: GROUP_COLORS[i]!, state: groupColStateOf(evals[i]!) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupSets, groupName, g0.evaluable, g0.hits, g0.isLoading, g0.ready, g0.tooWide, g0.truncated, g0.themesReady, g0.error, g1.evaluable, g1.hits, g1.isLoading, g1.ready, g1.tooWide, g1.truncated, g1.themesReady, g1.error, g2.evaluable, g2.hits, g2.isLoading, g2.ready, g2.tooWide, g2.truncated, g2.themesReady, g2.error, g3.evaluable, g3.hits, g3.isLoading, g3.ready, g3.tooWide, g3.truncated, g3.themesReady, g3.error, g4.evaluable, g4.hits, g4.isLoading, g4.ready, g4.tooWide, g4.truncated, g4.themesReady, g4.error]);

    return { picked, setPicked, groupSets, groupCols, groupName };
}
