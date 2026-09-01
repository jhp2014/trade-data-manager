// 시트의 **열 구성** — 무슨 열이 어느 자리에 얼마나 넓게 서고, 어디서 그룹이 나뉘나.
//
// 네 가지 로컬 설정이 한 덩어리인 이유는 성격이 아니라 **위험**이 같아서다: 넷 다 키에 축 id 를 담고
// 있어서(`ax:<id>`), 축이 지워지면 유령 키가 남는다. 청소는 한 번에 해야 규칙이 어긋나지 않는다 —
// 그래서 그룹 컷(cuts)도 여기 산다. 컷을 소비하는 건 정렬 쪽이지만, 그 키가 죽는 사정은 나머지 셋과 같다.
//
// ⚠ **로딩 중엔 절대 청소하지 않는다.** 판단 축과 계산 축은 별도 요청이라, 판단 축만 도착한 순간에
// 청소가 돌면 아직 안 온 계산 축 열의 고정·숨김·폭을 유령으로 오인해 지운다. 사용자 설정이 조용히
// 사라지는 종류의 사고라 가드가 필수다.
import { useEffect, useMemo, useRef, useState } from "react";
import { isComputedAxis } from "../../lib/computedAxis.js";
import type { AxisRef } from "../../lib/computedAxis.js";
import { usePersistedState } from "../../store/persist.js";
import { useWorkbench } from "../../store/workbench.js";
import { layoutColumns, pruneAxisKeys, reorderFrozenCols, type Col } from "./sheetColumns.js";

const FROZEN_KEY = "wb.rankSheetFrozenCols";
const HIDDEN_KEY = "wb.rankSheetHiddenCols";
const WIDTHS_KEY = "wb.rankSheetColWidths";
/** 축 열 그룹 컷 — colKey(`ax:<id>`) → slotId[]. 시트 전용(축의 속성이 아님)이라 로컬. */
const CUTS_KEY = "wb.rankSheetCuts";
/** day 행 모드는 고정·숨김·폭을 **딴 주머니**에 — 모드 토글이 열 배치를 섞으면 안 된다.
 *  컷(CUTS_KEY)만 공유: 컷은 축의 자리(orderKey 앵커)라 행 모드와 무관하게 같은 뜻이다. */
const dayKey = (k: string): string => `${k}.day`;

/** 되짚기 강조가 남는 시간(ms) — 스크롤이 멎고 눈이 따라잡을 만큼. */
const FLASH_MS = 1400;

export interface SheetColumns {
    /** 그릴 열들과 그 기하 — layoutColumns 의 결과 그대로. */
    displayCols: Col[];
    leftOf: Map<string, number>;
    tableW: number;
    lastFrozenKey: string | null;
    widthOf: (c: Col) => number;

    frozenSet: ReadonlySet<string>;
    hiddenCols: string[];
    /** 손으로 조절한 폭이 하나라도 있나 — "폭 원위치" 손잡이를 띄울지. */
    hasManualWidths: boolean;
    toggleFrozen: (k: string) => void;
    /** 고정 그룹 **안에서만** 순서를 바꾼다(축 서열은 안 건드린다 — 순서 소스가 둘이라 규칙을 갈랐다). */
    reorderFrozen: (dragged: string, target: string) => void;
    toggleHidden: (k: string) => void;
    showAllHidden: () => void;
    /** 드래그 중 폭 미리보기 — **메모리로만** 그린다(영속 없음). 확정은 commitWidth 가 한다. */
    previewWidth: (k: string, w: number) => void;
    /** 폭 확정(pointerup 1회) — 영속에 적고 미리보기 층을 비운다. */
    commitWidth: (k: string, w: number) => void;
    resetWidths: () => void;

    /** 축 열 그룹 컷 — colKey → slotId[]. */
    cuts: Record<string, string[]>;
    toggleCut: (axisId: string, slotId: string) => void;
    clearCuts: (axisId: string) => void;

    /** 열 헤더 등록(되짚기 스크롤 대상). */
    registerTh: (key: string, el: HTMLElement | null) => void;
    /** 지금 강조 중인 열 키. */
    flashCol: string | null;
}

export function useSheetColumns({ axes, axesLoading, containerW, axisMin, rowMode = "point", pruneAxisIds }: {
    axes: AxisRef[];
    axesLoading: boolean;
    /**
     * 유령 키 청소의 기준 축 목록 — **전체 축**(모드 필터 전). day 모드는 axes 를 day 축으로 좁혀
     * 넘기는데, 그 목록으로 프룬하면 공유 주머니(컷)의 point 축 키를 유령으로 오인해 지운다.
     * 생략 = axes 그대로(point 모드).
     */
    pruneAxisIds?: string[];
    /** 표 스크롤 컨테이너의 폭 — 남는 폭을 축 열들이 나눠 갖는다. */
    containerW: number;
    /** 축 열의 최소 폭(셀 표시 모드가 정한다 — 눈금 모드는 그릴 폭이 필요하다). */
    axisMin: number;
    /** 행 모드 — day 는 기본 열(시간 대신 타점 수·코멘트)과 저장 주머니가 다르다. */
    rowMode?: "point" | "day";
}): SheetColumns {
    const day = rowMode === "day";
    const [frozenCols, setFrozenCols] = usePersistedState<string[]>(day ? dayKey(FROZEN_KEY) : FROZEN_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null), day ? ["date"] : ["date", "time"]);
    const [hiddenCols, setHiddenCols] = usePersistedState<string[]>(day ? dayKey(HIDDEN_KEY) : HIDDEN_KEY, (o) => (Array.isArray(o) ? (o as string[]) : null), []);
    const [colWidths, setColWidths] = usePersistedState<Record<string, number>>(day ? dayKey(WIDTHS_KEY) : WIDTHS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, number>) : null), {});
    const [cuts, setCuts] = usePersistedState<Record<string, string[]>>(CUTS_KEY, (o) => (o && typeof o === "object" ? (o as Record<string, string[]>) : null), {});
    // 드래그 중 폭의 **미리보기 층**(영속 밖) — pointermove 마다 localStorage 에 동기 기록하면 이벤트
    // 빈도만큼 JSON 직렬화가 돌아 드래그가 무거워진다. 움직이는 동안은 메모리로만 그리고 손을 뗄 때
    // commitWidth 가 한 번 영속에 적는다(최종 저장값 의미는 종전과 동일).
    const [previewWidths, setPreviewWidths] = useState<Record<string, number>>({});

    // 축을 지우면 그 축 키가 넷 모두에 유령으로 남는다 → 축 목록이 로드된 뒤 한 번 청소(위 ⚠ 참고).
    useEffect(() => {
        if (axesLoading || axes.length === 0) return;
        const ids = pruneAxisIds ?? axes.map((a) => a.key);
        setFrozenCols((f) => pruneAxisKeys(f, ids));
        setHiddenCols((h) => pruneAxisKeys(h, ids));
        setColWidths((w) => pruneAxisKeys(w, ids));
        setCuts((c) => pruneAxisKeys(c, ids));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [axes, axesLoading, pruneAxisIds]);

    // ── "저 축 보여줘"(타점 정보 → 여기) — 그 축 **열**로 가로 스크롤하고 잠깐 강조한다.
    //    시트에서는 열이 곧 축이고 축이 많으면 가로로 넘치므로 찾아 주는 일이 필요하다.
    //    숨긴 열이면 먼저 꺼내 준다 — 안 그러면 눌러도 아무 일이 없다.
    const revealAxis = useWorkbench((s) => s.revealAxis);
    const thRefs = useRef<Map<string, HTMLElement>>(new Map());
    const [flashCol, setFlashCol] = useState<string | null>(null);
    // 재발화 가드 — store 는 소비 후에도 revealAxis 를 남기므로(요청 큐가 아니라 마지막 요청 상태),
    // at 비교 없이는 재마운트(프리셋 전환 등)가 지난 요청을 다시 재생한다(번쩍임 + 스크롤 점프).
    // 마운트 시점에 이미 있던 요청 = 이미 처리된 것으로 본다(ref 초기값).
    const lastRevealAt = useRef(revealAxis?.at ?? 0);
    useEffect(() => {
        if (!revealAxis || revealAxis.at <= lastRevealAt.current) return;
        lastRevealAt.current = revealAxis.at;
        const key = `ax:${revealAxis.axisId}`;
        setHiddenCols((h) => h.filter((k) => k !== key));
        setFlashCol(key);
        // 숨김 해제가 렌더된 뒤에 스크롤해야 대상이 존재한다.
        const raf = requestAnimationFrame(() => thRefs.current.get(key)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }));
        const t = setTimeout(() => setFlashCol(null), FLASH_MS);
        return () => { cancelAnimationFrame(raf); clearTimeout(t); };
    }, [revealAxis, setHiddenCols]);

    // 기본 순서 → 숨김 제외 → 고정 먼저(기본순 유지, 좌측 스택) → 비고정. 종목은 항상 표시·고정.
    // day 모드: 시간(타점 소유)은 아예 없고, 타점 수(자동 파생)·코멘트(존재 지도)가 뒤에 선다.
    const baseCols = useMemo<Col[]>(() => [
        { key: "name" }, { key: "date" },
        ...(day ? [] : [{ key: "time" } as Col]),
        ...axes.map((a): Col => ({ key: "axis", axisId: a.key, name: a.name, computed: isComputedAxis(a.key) })),
        ...(day ? [{ key: "points" } as Col, { key: "comment" } as Col] : []),
    ], [axes, day]);
    // 미리보기 층이 영속 폭을 덮는다 — 드래그 중에도 열이 실시간으로 넓어져 보이되 저장은 안 된다.
    const effectiveWidths = useMemo(
        () => (Object.keys(previewWidths).length ? { ...colWidths, ...previewWidths } : colWidths),
        [colWidths, previewWidths],
    );
    const layout = useMemo(
        () => layoutColumns({ baseCols, frozenCols, hiddenCols, colWidths: effectiveWidths, containerW, axisMin }),
        [baseCols, frozenCols, hiddenCols, effectiveWidths, containerW, axisMin],
    );

    const frozenSet = useMemo(() => new Set(frozenCols), [frozenCols]);

    return {
        ...layout,
        frozenSet,
        hiddenCols,
        hasManualWidths: Object.keys(colWidths).length > 0,
        toggleFrozen: (k) => setFrozenCols((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k])),
        reorderFrozen: (dragged, target) => setFrozenCols((f) => reorderFrozenCols(f, dragged, target)),
        toggleHidden: (k) => setHiddenCols((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k])),
        showAllHidden: () => setHiddenCols([]),
        previewWidth: (k, w) => setPreviewWidths((m) => ({ ...m, [k]: w })),
        commitWidth: (k, w) => { setColWidths((m) => ({ ...m, [k]: w })); setPreviewWidths({}); },
        resetWidths: () => { setColWidths({}); setPreviewWidths({}); },
        cuts,
        toggleCut: (axisId, slotId) => setCuts((m) => {
            const k = `ax:${axisId}`;
            const cur = m[k] ?? [];
            const next = cur.includes(slotId) ? cur.filter((s) => s !== slotId) : [...cur, slotId];
            // 빈 배열은 남기지 않는다 — 없는 조건이 키로 남으면 청소 규칙이 헷갈린다.
            return next.length ? { ...m, [k]: next } : Object.fromEntries(Object.entries(m).filter(([x]) => x !== k));
        }),
        clearCuts: (axisId) => setCuts((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== `ax:${axisId}`))),
        registerTh: (key, el) => { if (el) thRefs.current.set(key, el); else thRefs.current.delete(key); },
        flashCol,
    };
}
