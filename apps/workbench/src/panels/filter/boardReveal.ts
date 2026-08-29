// 되짚기 — 조건 목록(집합 편성 보드)에서 그 조건의 **편집면**으로 데려오는 손짓의 배선.
// 이름·▸ 를 누르면 그 조건이 사는 줄로 스크롤하고 잠깐 강조한다(flash).
//
// ⚠ 이 손짓은 **패널 경계를 넘는다**(보드 → 필터 레일 패널). 그래서 신호를 프롭이 아니라 세션 상태에
// 남긴다: 대상 패널이 닫혀 있었다면 방금 열려 아직 첫 렌더도 안 됐고, rAF 한 프레임으로는 못 기다린다.
// 남겨 둔 신호를 대상이 마운트하며 읽어 소비하는 편이 "열고 나서 데려가기"를 순서 문제 없이 푼다.
// 소비 후 지우지 않는다 — 같은 줄을 다시 누를 때 `at` 이 갱신되는 것이 재발화의 규약이다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkbench } from "../../store/workbench.js";
import type { FilterStage } from "./stage.js";
import type { RailKey } from "./stageBinding.js";

/**
 * 조건 목록에서 편집면으로 데려오는 손짓 — 조건 이름을 누르면 그 조건이 사는 줄로.
 * `at` 은 같은 줄을 다시 눌러도 다시 강조되게 하는 손도장이다.
 */
export interface BoardReveal {
    stageId: string;
    at: number;
}

/** 되짚기 신호가 사는 세션 자리. 키 = 데려갈 화면(레일 패널 등). */
export const REVEAL_SCOPE = "funnelReveal";
/** 레일 줄(축·날짜·시간)이 사는 화면의 자리 — 보내는 손과 받는 화면이 이 키 하나로 만난다. */
export const RAIL_REVEAL = "rails";

/** 되짚기 신호 한 자리 — 보내는 쪽(보드)과 받는 쪽(편집면)이 같은 키를 본다. */
export function useRevealSignal(key: string): { reveal: BoardReveal | null; send: (stageId: string) => void } {
    const stored = useWorkbench((s) => s.sessionUi[REVEAL_SCOPE]?.[key]) as BoardReveal | undefined;
    const setSessionUi = useWorkbench((s) => s.setSessionUi);
    const send = useCallback(
        (stageId: string) => setSessionUi(REVEAL_SCOPE, key, { stageId, at: Date.now() }),
        [setSessionUi, key],
    );
    return { reveal: stored ?? null, send };
}

export const rowIdOfKey = (k: RailKey): string => (k.kind === "axis" ? `axis:${k.axisId}` : k.kind);

/** 이 필터가 보드의 어느 줄에 사는가 — 되짚기(위 목록 → 보드)의 유일한 대응표. */
export function rowIdOfStage(s: FilterStage): string {
    const first = s.predicates[0];
    if (!first) return `group:${s.id}`;
    switch (first.kind) {
        case "group": return `group:${s.id}`;
        case "axisBand":
        case "axisValue": return `axis:${first.axisId}`;
        case "date": return "date";
        case "time": return "time";
        case "themeStrength": return `theme:${s.id}`;
    }
}

/** 줄 등록 + 스크롤·강조 — 보드는 registerRow 로 줄을 알려 주고 flash 로 강조 여부를 읽는다. */
export function useBoardReveal(reveal: BoardReveal | null, stages: readonly FilterStage[], opts: {
    /**
     * 스크롤 **전에** 그 줄을 화면에 존재하게 만드는 기회 — 접힌 서랍 안 줄은 DOM 에 아예 없어
     * 등록된 ref 가 없다(누르면 아무 일도 안 나는 상태). 여기서 서랍을 펼치고, 스크롤은 다음 프레임에.
     * 시트가 숨긴 열을 먼저 꺼내고 rAF 뒤에 스크롤하는 것과 같은 대응(useSheetColumns).
     */
    onBeforeScroll?: (rowId: string) => void;
} = {}): {
    registerRow: (id: string) => (el: HTMLElement | null) => void;
    flash: string | null;
} {
    // effect 안에서 최신 콜백을 읽는다 — 매 렌더 새 함수가 와도 effect 가 재발화하지 않게(재스크롤 방지).
    const beforeScroll = useRef(opts.onBeforeScroll);
    beforeScroll.current = opts.onBeforeScroll;
    const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
    const revealRowId = useMemo(() => {
        if (!reveal) return null;
        const s = stages.find((x) => x.id === reveal.stageId);
        return s ? rowIdOfStage(s) : null;
    }, [reveal, stages]);
    const [flash, setFlash] = useState<string | null>(null);
    useEffect(() => {
        if (!revealRowId) return;
        beforeScroll.current?.(revealRowId);
        // 방금 펼친 줄은 이 tick 에 아직 없다 — 다음 프레임에 찾는다(있던 줄이면 한 프레임 늦을 뿐).
        const raf = requestAnimationFrame(() =>
            rowRefs.current.get(revealRowId)?.scrollIntoView({ block: "center", behavior: "smooth" }));
        setFlash(revealRowId);
        const t = setTimeout(() => setFlash(null), 1400);
        return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    }, [revealRowId, reveal?.at]);

    const registerRow = (id: string) => (el: HTMLElement | null): void => {
        if (el) rowRefs.current.set(id, el);
        else rowRefs.current.delete(id);
    };

    return { registerRow, flash };
}
