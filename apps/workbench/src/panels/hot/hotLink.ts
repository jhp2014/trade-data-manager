// 급타점 조건의 연동 행 + **"지금 보는 (창 W, 상승률 r)"** 의 단일 출처.
// 결과의 `panels/outcome/outcomeLink.ts` 와 동형이다 — 갈리는 건 파라미터가 스칼라 하나가 아니라 쌍이라는 것뿐.
//
//   표시 (W,r) = 연동 행의 (w,r), 연동이 없으면 **탐색 (W,r)**(세션)
//
// 테마 순위 패널의 "행 0개면 순수 산점"과 같은 규칙이고, 연동 해석은 themeLink 의 코어를 그대로 쓴다
// (죽은 id → 다음 행) — 세 벌이 되면 그 규칙이 갈린다.
//
// ⚠ **(W,r) 을 읽는 자리는 이 모듈을 지난다.** 여기 말고 다른 곳에서 지어내면 화면마다 다른 기준이 선다.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    DEFAULT_HOT_R, DEFAULT_HOT_W, HOT_MAX_INSTANCES, clampHotR, clampHotW, nextFreeHotParams, type HotParams,
} from "../../lib/hotPoints.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { useLinkedStageId } from "../filter/themeLink.js";
import { stageKind, type FilterStage } from "../filter/stage.js";

export const HOT_LINK_SCOPE = "hotLink";
/** 탐색 (W,r) — 연동 행이 없을 때의 기준. 세션 수명(연동 포인터와 같은 갈림길: 새로고침 = 새 시작). */
export const HOT_PARAMS_SCOPE = "hotParams";
export const HOT_W_KEY = "w";
export const HOT_R_KEY = "r";

/** 급타점 계열 행인가. */
export const isHotStage = (s: FilterStage): boolean => stageKind(s) === "hotPoints";

/** 그 행의 (W,r) — 급타점 계열이 아니면 null. */
export function hotParamsOf(s: FilterStage): HotParams | null {
    for (const p of s.predicates) if (p.kind === "hotPoints") return { w: p.w, r: p.r };
    return null;
}

export interface LinkedHot {
    /** 보드 순서 그대로의 급타점 행들(칩 스트립의 목록). */
    hotStages: FilterStage[];
    /** 지금 연동된 행 id — null 은 명시적 해제(그때는 탐색 값이 기준). */
    linkedId: string | null;
    setLinked: (id: string | null) => void;
    /** 지금 보는 (W,r) — 연동 행의 것, 없으면 탐색 값. */
    display: HotParams;
    /**
     * (W,r) 커밋 — 연동 행이 있으면 **그 행의 파라미터를 옮기고**(조건의 기준이 바뀐다), 없으면 탐색 값만.
     * 연동 행이 있을 때 탐색 값도 같이 적어 둔다: 연동을 풀었을 때 화면이 튀지 않게.
     *
     * ⚠ **자리 충돌은 거절한다** — 레일 키가 (W × r) 이라, 옮긴 자리에 다른 급타점 조건이 이미 있으면
     * 뒤 조건이 편집면에서 사라진 채 계속 필터링한다. 그때는 안 옮기고 `conflictAt` 으로 알린다 —
     * 조용히 덮어쓰는 것보다 정직하다(결과 T 레일과 같은 규칙).
     */
    setDisplay: (w: number, r: number) => void;
    /** 직전 setDisplay 가 자리 충돌로 거절된 (W,r) — 화면이 이유를 말할 재료. 성공하면 null. */
    conflictAt: HotParams | null;
    /**
     * 새로 만들 때 쓸 (W,r) — 사다리에서 **아직 안 쓰인 첫 자리**. null 이면 만들지 않는다.
     * 늘 기본값을 쓰면 같은 레일 자리에 행이 둘 서고, 그때 그은 컷이 `stagesFor(...)[0]` 탓에
     * 연동 표시와 **다른 행**으로 들어간다(자리 충돌 거절을 이동에서만 하고 생성에서 안 한 구멍).
     */
    nextParams: HotParams | null;
    /** 인스턴스를 더 만들 수 있나 — 상한 + 빈 자리 유무. 상한은 **생성 지점에서만** 막는다. */
    canAdd: boolean;
}

export function useLinkedHot(): LinkedHot {
    const stages = useWorkbench(selectFilterStages);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const setSessionUi = useWorkbench((s) => s.setSessionUi);
    const [conflictAt, setConflictAt] = useState<HotParams | null>(null);
    // 칩을 갈아 끼우면 거절 문구를 지운다 — 안 지우면 "…에 같은 조건이 이미 있습니다"가 다른
    // 조건을 보는 중에도 남아 엉뚱한 줄을 가리킨다(리뷰 2026-09-09).
    const [conflictFor, setConflictFor] = useState<string | null>(null);
    const rawW = useWorkbench((s) => s.sessionUi[HOT_PARAMS_SCOPE]?.[HOT_W_KEY]);
    const rawR = useWorkbench((s) => s.sessionUi[HOT_PARAMS_SCOPE]?.[HOT_R_KEY]);
    const exploreW = typeof rawW === "number" ? clampHotW(rawW) : DEFAULT_HOT_W;
    const exploreR = typeof rawR === "number" ? clampHotR(rawR) : DEFAULT_HOT_R;

    const hotStages = useMemo(() => stages.filter(isHotStage), [stages]);
    const curIds = useMemo(() => hotStages.map((s) => s.id), [hotStages]);
    const { linkedId, setLinked } = useLinkedStageId(HOT_LINK_SCOPE, curIds);
    // 거절 문구를 지워야 하는 두 경우 — ① 칩을 갈아 끼웠다 ② 막고 있던 상대 행이 사라지거나 옮겨가
    // 그 자리가 이제 비었다. ②를 안 보면 "…에 같은 조건이 이미 있습니다"가 사실이 아닌 채로 남는다.
    const stillClashing = conflictAt !== null && hotStages.some((st) => st.id !== conflictFor
        && st.predicates.some((p) => p.kind === "hotPoints" && p.w === conflictAt.w && p.r === conflictAt.r));
    useEffect(() => {
        if (conflictFor !== null && (conflictFor !== linkedId || !stillClashing)) {
            setConflictAt(null);
            setConflictFor(null);
        }
    }, [linkedId, conflictFor, stillClashing]);

    const linked = linkedId === null ? undefined : hotStages.find((s) => s.id === linkedId);
    const linkedParams = linked ? hotParamsOf(linked) : null;
    const display = useMemo<HotParams>(
        () => linkedParams ?? { w: exploreW, r: exploreR },
        [linkedParams?.w, linkedParams?.r, exploreW, exploreR], // eslint-disable-line react-hooks/exhaustive-deps
    );

    const setDisplay = useCallback((w: number, r: number): void => {
        const nw = clampHotW(w);
        const nr = clampHotR(r);
        if (!linked) {
            setConflictAt(null);
            setConflictFor(null);
            setSessionUi(HOT_PARAMS_SCOPE, HOT_W_KEY, nw);
            setSessionUi(HOT_PARAMS_SCOPE, HOT_R_KEY, nr);
            return;
        }
        // 자리 충돌 검사 — 옮긴 (W,r) 에 다른 급타점 조건이 이미 있으면 거절한다.
        const clash = hotStages.some((st) => st.id !== linked.id
            && st.predicates.some((p) => p.kind === "hotPoints" && p.w === nw && p.r === nr));
        if (clash) {
            setConflictAt({ w: nw, r: nr });
            setConflictFor(linked.id);
            return;
        }
        setConflictAt(null);
        setConflictFor(null);
        setSessionUi(HOT_PARAMS_SCOPE, HOT_W_KEY, nw);
        setSessionUi(HOT_PARAMS_SCOPE, HOT_R_KEY, nr);
        // 그 행의 모든 급타점 술어가 같은 (W,r) 을 든다(행 하나 = 술어 하나라 실제로는 하나).
        setPredicates(linked.id, linked.predicates.map((p) => (p.kind === "hotPoints" ? { ...p, w: nw, r: nr } : p)));
    }, [linked, hotStages, setPredicates, setSessionUi]);

    const taken = useMemo(
        () => hotStages.map((st) => hotParamsOf(st)).filter((x): x is HotParams => x !== null),
        [hotStages],
    );
    const nextParams = useMemo(() => nextFreeHotParams(taken), [taken]);
    return {
        hotStages, linkedId, setLinked, display, setDisplay, conflictAt, nextParams,
        canAdd: hotStages.length < HOT_MAX_INSTANCES && nextParams !== null,
    };
}

/** "지금 보는 (W,r)" 만 필요한 소비자용 — 값의 규칙은 위와 같은 한 곳이다. */
export const useDisplayHot = (): HotParams => useLinkedHot().display;
