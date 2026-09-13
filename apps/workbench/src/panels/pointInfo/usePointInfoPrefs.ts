// 타점 정보 패널의 순서·숨김 **영속 한 벌**. 규칙은 prefs.ts(순수), 여긴 저장물과 청소 타이밍.
//
// ⚠ 이 두 키의 **단일 소유자**다(usePersistedState = 컴포넌트 로컬 state + localStorage라, 두 인스턴스가
//   뜨면 서로 덮어쓴다). 패널을 복수 인스턴스로 만들려면 저장물 모양부터 바꿔야 한다.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePersistedState } from "../../store/persist.js";
import { GRID_AXIS_IDS } from "../../lib/gridFeatures.js";
import { hotAxisId, hotInstancesOf } from "../../lib/hotAxis.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { HIDDEN_KEY, ORDER_KEY, moveRow, orderRows, parseKeys, pruneRowKeys } from "./prefs.js";
import type { PointInfoRow } from "./rows.js";

export interface PointInfoPrefs {
    /** 사용자 순서를 입힌 줄 목록(본문·서랍 가르기 전). */
    ordered: PointInfoRow[];
    hidden: ReadonlySet<string>;
    toggleHidden: (key: string) => void;
    /** 서랍에 선 줄만 되돌린다 — 인자는 지금 서랍이 보여 주는 키들(아래 ⚠). */
    unhideAll: (keys: readonly string[]) => void;
    /** 드래그 한 번 — 방향은 화면 순서, 이동은 전체 순서 위에서 한 칸(prefs.moveRow). */
    reorder: (dragged: string, target: string, shownKeys: readonly string[]) => void;
}

export function usePointInfoPrefs(rows: readonly PointInfoRow[], live: { axisKeys: readonly string[]; allThemes: readonly string[] | null; isLoading: boolean }): PointInfoPrefs {
    const [order, setOrder] = usePersistedState<string[]>(ORDER_KEY, parseKeys, []);
    const [hidden, setHidden] = usePersistedState<string[]>(HIDDEN_KEY, parseKeys, []);

    // 격자 로딩 창에 잠깐 없는 축들 — 시트와 같은 보호 목록(없으면 로딩 중 한 번에 유령으로 몰린다).
    const stages = useWorkbench(selectFilterStages);
    const liveAxisKeys = useMemo(
        () => [...live.axisKeys, ...GRID_AXIS_IDS, ...hotInstancesOf(stages).map((h) => hotAxisId(h.stageId))],
        [live.axisKeys, stages],
    );

    // ⚠ 재료가 다 온 뒤에만 청소한다 — 축과 테마는 **서로 다른 시각에 도착**한다. 한쪽만 온 순간에
    //   돌면 아직 안 온 쪽의 순서·숨김이 통째로 날아간다(사용자 설정이 조용히 사라지는 종류).
    //   **빈 목록도 잠금이다**(축·테마 둘 다): 테마가 `[]` 로 도착하는 경로가 실재하고(미러가 비었거나
    //   멤버십 응답이 일시적으로 빈 배열), 그때 청소가 돌면 저장된 `th:` 키가 통째로 지워진다 —
    //   멤버십이 정상 복구돼도 되돌릴 수 없다. 지울 게 있는지 모르는 상태에선 아무것도 안 지운다.
    useEffect(() => {
        if (live.isLoading || live.allThemes === null || live.allThemes.length === 0 || live.axisKeys.length === 0) return;
        const prune = (cur: string[]): string[] => pruneRowKeys(cur, { axisKeys: liveAxisKeys, themes: live.allThemes! });
        setOrder(prune);
        setHidden(prune);
    }, [live.isLoading, live.allThemes, live.axisKeys, liveAxisKeys, setOrder, setHidden]);

    const ordered = useMemo(() => orderRows(rows, order), [rows, order]);
    const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

    // 전체 순서(본문+서랍) — 이동의 기준 목록. 핸들러가 목록 때문에 매번 새 참조로 서지 않게 ref 로 든다.
    const allKeysRef = useRef<string[]>([]);
    allKeysRef.current = useMemo(() => ordered.map((r) => r.key), [ordered]);

    const reorder = useCallback((dragged: string, target: string, shownKeys: readonly string[]) => {
        setOrder((prev) => moveRow(prev, allKeysRef.current, shownKeys, dragged, target) ?? prev);
    }, [setOrder]);

    return {
        ordered,
        hidden: hiddenSet,
        toggleHidden: useCallback((key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key])), [setHidden]),
        // ⚠ **지금 서랍에 선 키만** 지운다 — 저장물을 통째로 비우면 다른 종목에서 치운 줄까지 함께
        //   살아난다(서랍 머리는 "숨김 1"이라 말하는데 실제로는 열 개가 되살아나는 모양).
        unhideAll: useCallback((keys: readonly string[]) => setHidden((h) => h.filter((k) => !keys.includes(k))), [setHidden]),
        reorder,
    };
}
