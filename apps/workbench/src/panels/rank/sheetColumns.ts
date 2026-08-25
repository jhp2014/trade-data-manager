// 타점 시트의 **열 구성**(순수) — 열 기술자·기본 속성 테이블 + 배치 계산(고정 스택·폭·순서).
// 렌더(RankSheetPanel)에서 떼어낸 이유: 폭 분배와 고정 순서는 규칙이 얽혀 있어(수동 폭 ↔ 잔여 분배,
// 고정 배열 순서 ↔ 축 서열) 눈으로 확인하기 어렵다. 여기 두면 테스트가 규칙을 붙잡는다.
//
// 열을 하나 붙이려면 여기 **Col 한 항목 + COL_META 한 줄**, 그리고 패널의 CELLS 한 항목(컴파일러가 강제).
import type { CSSProperties } from "react";

// 고정폭(table-layout:fixed + colgroup) — 열 고정 sticky 오프셋이 실제 폭과 정확히 맞도록.
const NAME_W = 96;
const DATE_W = 66;
const TIME_W = 46;
const AXIS_W = 58;
/**
 * 계산 축 열 — `+17.8% (14/76)` 이 **한 줄에** 들어가야 한다(값·순위·괄호·셀 패딩까지).
 * 좁히면 값이 잘리는데, 값이 잘린 계산 축 열은 존재 이유가 없다. 수동 폭은 그대로 우선.
 */
const AXIS_VALUE_W = 112;
const OUT_W = 88;
/** 수동 리사이즈 하한 — 더 좁아지면 헤더 손잡이조차 못 잡는다. */
export const MIN_COL_W = 32;

export type Col =
    | { key: "name" }
    | { key: "date" }
    | { key: "time" }
    /** computed = 계산 축(값을 아는 축). 폭·표기가 갈리는 유일한 자리라 열 기술자가 들고 있는다. */
    | { key: "axis"; axisId: string; name: string; computed: boolean }
    | { key: "outcome" }
    /** day 행 모드 전용 둘 — 타점 수(분봉 작업 진도) · 당일 코멘트 유무(존재 지도 재사용). */
    | { key: "points" }
    | { key: "comment" };
export type ColKind = Col["key"];

// td 기본 스타일 3종 — COL_META 가 참조하므로 먼저 선언한다.
const td: CSSProperties = { padding: "5px 8px", color: "var(--text-primary)" };
const tdCell: CSSProperties = { padding: "5px 8px", textAlign: "center" };

// 열 종류별 고정 속성 한 테이블 — 폭·헤더 라벨·정렬(가로)·td 기본 스타일.
// 예전엔 이 넷이 각각 삼항 체인이라 열을 하나 붙일 때마다 네 군데를 같이 고쳐야 했다(하나 빠뜨리면
// 폭만 안 맞거나 라벨이 빈칸).
export interface ColMeta {
    width: number; // 기본 폭. 사용자가 수동 폭을 주면 그쪽이 이긴다.
    label: string; // axis 는 축 이름이라 런타임 override(colLabel)
    justify: "flex-start" | "center" | "flex-end";
    td: CSSProperties;
}
export const COL_META: Record<ColKind, ColMeta> = {
    name: { width: NAME_W, label: "종목", justify: "flex-start", td: td },
    date: { width: DATE_W, label: "날짜", justify: "center", td: td },
    time: { width: TIME_W, label: "시간", justify: "center", td: td },
    axis: { width: AXIS_W, label: "", justify: "center", td: tdCell },
    outcome: { width: OUT_W, label: "결과", justify: "flex-start", td: td },
    points: { width: 52, label: "타점", justify: "center", td: tdCell },
    comment: { width: 40, label: "코", justify: "center", td: tdCell },
};

export const colKey = (c: Col): string => (c.key === "axis" ? `ax:${c.axisId}` : c.key);
export const colWidth = (c: Col): number => (c.key === "axis" && c.computed ? AXIS_VALUE_W : COL_META[c.key].width);
export const colLabel = (c: Col): string => (c.key === "axis" ? c.name : COL_META[c.key].label);

export interface SheetLayout {
    /** 그릴 순서 그대로 — [고정 스택…, 비고정…]. */
    displayCols: Col[];
    /** 고정 열의 sticky left 오프셋(px). 비고정 열은 키가 없다. */
    leftOf: Map<string, number>;
    tableW: number;
    /** 고정 스택의 마지막 열(경계선). 고정이 종목뿐이어도 그 키. */
    lastFrozenKey: string | null;
    widthOf: (c: Col) => number;
}

/**
 * 열 배치 — 숨김 제외 → 고정 스택(순서 = frozenCols 배열) → 비고정(기본 순서) → 폭 확정.
 *
 * 폭 규칙: **수동 폭을 준 열과 계산 축 열이 고정폭**. 나머지 축 열이 남는 폭을 나눠 갖는다(최소 axisMin).
 * 그래서 수동 폭을 전부 지우면(원위치) 기본 동작으로 정확히 복귀하고, 전부 지정하면 전부 고정폭이 된다.
 * 계산 축이 고정인 이유: 셀에 값과 순위가 같이 들어가(`+12.3% (3/12)`) 분배 폭으로는 잘린다.
 * 판단 축은 `3/12` 뿐이라 좁아도 읽힌다 — 남는 폭은 그쪽이 나눠 갖는 게 맞다.
 *
 * 종목 열은 언제나 고정 스택 맨 앞 붙박이라 frozenCols 에 없어도 고정으로 친다(사용자가 못 푼다).
 */
export function layoutColumns({ baseCols, frozenCols, hiddenCols, colWidths, containerW, axisMin }: {
    baseCols: Col[];
    frozenCols: string[]; // 고정 열 키(이 **배열 순서**가 곧 좌측 스택 순서)
    hiddenCols: string[];
    colWidths: Record<string, number>; // colKey → 수동 폭(px)
    containerW: number;
    axisMin: number; // 축 열 최소폭(위치바 모드에서 커진다)
}): SheetLayout {
    const hidden = new Set(hiddenCols);
    const visible = baseCols.filter((c) => c.key === "name" || !hidden.has(colKey(c)));

    const byKey = new Map(visible.map((c) => [colKey(c), c]));
    const frozen: Col[] = [
        ...visible.filter((c) => c.key === "name"),
        ...frozenCols.map((k) => byKey.get(k)).filter((c): c is Col => c != null && c.key !== "name"),
    ];
    const frozenKeys = new Set(frozen.map(colKey));
    const displayCols = [...frozen, ...visible.filter((c) => !frozenKeys.has(colKey(c)))];

    const manual = (c: Col): number | undefined => colWidths[colKey(c)];
    const flex = displayCols.filter((c) => c.key === "axis" && !c.computed && manual(c) == null);
    const flexKeys = new Set(flex.map(colKey));
    const fixed = displayCols.reduce((sum, c) => sum + (flexKeys.has(colKey(c)) ? 0 : (manual(c) ?? colWidth(c))), 0);
    const n = flex.length;
    const grown = n > 0 && containerW > fixed + n * axisMin ? Math.floor((containerW - fixed) / n) : axisMin;
    const widthOf = (c: Col): number => manual(c) ?? (c.key === "axis" && !c.computed ? grown : colWidth(c));

    const leftOf = new Map<string, number>();
    let acc = 0;
    for (const c of frozen) { leftOf.set(colKey(c), acc); acc += widthOf(c); }

    return {
        displayCols,
        leftOf,
        tableW: displayCols.reduce((sum, c) => sum + widthOf(c), 0),
        lastFrozenKey: frozen.length ? colKey(frozen[frozen.length - 1]) : null,
        widthOf,
    };
}

/** 고정 그룹 안 재정렬 — 배열이 곧 좌측 스택 순서다. 축 열이 섞여 있어도 축 서열(rankAxisOrder)은 안 건드린다. */
export function reorderFrozenCols(cols: string[], dragged: string, target: string): string[] {
    const from = cols.indexOf(dragged);
    const to = cols.indexOf(target);
    if (from < 0 || to < 0 || from === to) return cols;
    const next = cols.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
}


/** 사라진 축의 유령 키 제거(고정·숨김·폭·컷 목록 공용). 바뀔 게 없으면 **같은 배열/객체**를 돌려준다. */
export function pruneAxisKeys<T extends string[] | Record<string, unknown>>(cur: T, liveAxisIds: string[]): T {
    const live = new Set(liveAxisIds.map((id) => `ax:${id}`));
    const dead = (k: string): boolean => k.startsWith("ax:") && !live.has(k);
    if (Array.isArray(cur)) return (cur.some(dead) ? cur.filter((k) => !dead(k)) : cur) as T;
    const keys = Object.keys(cur);
    return (keys.some(dead) ? Object.fromEntries(Object.entries(cur).filter(([k]) => !dead(k))) : cur) as T;
}
