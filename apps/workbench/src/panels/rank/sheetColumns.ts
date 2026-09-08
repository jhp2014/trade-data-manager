// 타점 시트의 **열 구성**(순수) — 열 기술자·기본 속성 테이블 + 배치 계산(고정 스택·폭·순서).
// 렌더(RankSheetPanel)에서 떼어낸 이유: 폭 분배와 고정 순서는 규칙이 얽혀 있어(수동 폭 ↔ 잔여 분배,
// 고정 배열 순서 ↔ 축 서열) 눈으로 확인하기 어렵다. 여기 두면 테스트가 규칙을 붙잡는다.
//
// 열을 하나 붙이려면 여기 **Col 한 항목 + COL_META 한 줄**, 그리고 패널의 CELLS 한 항목(컴파일러가 강제).
import type { CSSProperties } from "react";
import { OUTCOME_COL_META, type OutcomeColId } from "./outcomeColumns.js";

// 고정폭(table-layout:fixed + colgroup) — 열 고정 sticky 오프셋이 실제 폭과 정확히 맞도록.
const NAME_W = 96;
const DATE_W = 66;
const TIME_W = 46;
const AXIS_W = 58;
/**
 * 계산 축 열 — 값 하나(`+1,234.5%`·`9,999.9억`)가 **한 줄에** 들어가야 한다(셀 패딩까지).
 * 좁히면 값이 잘리는데, 값이 잘린 계산 축 열은 존재 이유가 없다. 수동 폭은 그대로 우선.
 * 112 였던 것을 84 로 줄였다 — 순위 괄호(`(14/76)`)가 숫자 모드에서 빠지면서(sheetCell) 그만큼이
 * 순수한 여백이 됐다. 눈금 모드의 막대 폭(폭−18)도 이 값이 정하는데 66px 이면 충분하다.
 */
const AXIS_VALUE_W = 84;
/** 수동 리사이즈 하한 — 더 좁아지면 헤더 손잡이조차 못 잡는다. */
export const MIN_COL_W = 32;

/**
 * 조립 뷰의 부품 열 표식 — 결과 열이 **부품(저장 집합)별로 갈라질 때** 싣는다. 열 주소(colKey)는
 * **부품 id** 다: 정의 지문으로 하면 부품의 T1 을 만질 때마다 주소가 바뀌어 열 설정(폭·고정·숨김·정렬)이
 * 리셋된다("축 키는 뜻의 주소" 규칙 — decisions.md 「집합 조립 (OR)」). 색은 조립 안 순번(seriesColor) —
 * SetManager 부품 색점과 같은 출처.
 */
export interface OutPart {
    setId: string;
    name: string;
    color: string;
}

export type Col =
    | { key: "name" }
    | { key: "date" }
    | { key: "time" }
    /** computed = 계산 축(값을 아는 축). 폭·표기가 갈리는 유일한 자리라 열 기술자가 들고 있는다. */
    | { key: "axis"; axisId: string; name: string; computed: boolean }
    /** day 행 모드 전용 둘 — 타점 수(분봉 작업 진도) · 당일 코멘트 유무(존재 지도 재사용). */
    | { key: "points" }
    | { key: "comment" }
    /**
     * 결과 열(point 행 모드 전용) — 값은 축 피드가 아니라 **시트 전용 소스**(useOutcomes)에서 온다.
     * 과거/미래 경계(decisions.md 「시그널 결과」): 결과는 레일/서랍의 특징이 아니고, 시트는 읽기 면이라
     * 여기서만 합류한다. 폭·라벨·정렬(가로)이 열마다 갈려 axis 처럼 런타임 override 를 탄다.
     * part 가 실리면 조립 뷰의 **부품별 열**이다 — 값도 그 부품 정의의 파생에서 온다.
     */
    | { key: "out"; metric: OutcomeColId; part?: OutPart };
export type ColKind = Col["key"];

/** 부품 열이면 그 표식 — 헤더 색점·셀 "밖" 판정이 읽는다. */
export const colPart = (c: Col): OutPart | null => (c.key === "out" ? (c.part ?? null) : null);

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
    points: { width: 52, label: "타점", justify: "center", td: tdCell },
    comment: { width: 52, label: "메모", justify: "center", td: tdCell },
    out: { width: 56, label: "", justify: "flex-end", td: tdCell }, // 라벨·폭·정렬은 열별 override(아래 셋)
};

// 부품 열 키 = `out:<setId>:<metric>`(3조각 — metric id 에 `:` 가 없어 조각 수가 판정 자다).
export const colKey = (c: Col): string =>
    (c.key === "axis" ? `ax:${c.axisId}` : c.key === "out" ? (c.part ? `out:${c.part.setId}:${c.metric}` : `out:${c.metric}`) : c.key);
export const colWidth = (c: Col): number =>
    c.key === "axis" && c.computed ? AXIS_VALUE_W : c.key === "out" ? OUTCOME_COL_META[c.metric].width : COL_META[c.key].width;
export const colLabel = (c: Col): string =>
    (c.key === "axis" ? c.name : c.key === "out" ? (c.part ? `${c.part.name}·${OUTCOME_COL_META[c.metric].label}` : OUTCOME_COL_META[c.metric].label) : COL_META[c.key].label);
/** 가로 정렬 — out 은 열마다 갈린다(숫자=우측, 회복/상태=중앙). COL_META.justify 직접 읽기를 대체. */
export const colJustify = (c: Col): ColMeta["justify"] => (c.key === "out" ? OUTCOME_COL_META[c.metric].justify : COL_META[c.key].justify);
/** 헤더 툴팁의 열 설명 — 결과 열만 든다(축·기본 열은 라벨이 곧 설명). 부품 열은 그 부품 정의 기준임을 앞세운다. */
export const colHelp = (c: Col): string | null =>
    (c.key === "out" ? (c.part ? `부품 「${c.part.name}」 의 정의(T·게이트 등) 기준 — ${OUTCOME_COL_META[c.metric].help}` : OUTCOME_COL_META[c.metric].help) : null);

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
 * 계산 축이 고정인 이유: 셀에 값(`+1,234.5%`)이 들어가 분배 폭으로는 잘리고, 잘린 값은 못 읽는다.
 * 순위만 쓰는 열(값 좌표가 없는 축)은 `3/12` 뿐이라 좁아도 읽힌다 — 남는 폭은 그쪽이 나눠 갖는 게 맞다.
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
    return pruneBy(cur, dead);
}

/**
 * 지워진 부품(저장 집합)의 유령 열 키 제거 — `out:<setId>:<metric>`(**3조각**)만 대상이다.
 * 붙박이 2조각(`out:extHigh`)은 부품 무관이라 절대 안 건드린다 — 여길 잘못 물면 결과 열 설정이 통째 증발한다.
 */
export function pruneOutKeys<T extends string[] | Record<string, unknown>>(cur: T, liveSetIds: readonly string[]): T {
    const live = new Set(liveSetIds);
    const dead = (k: string): boolean => {
        if (!k.startsWith("out:")) return false;
        const parts = k.split(":");
        return parts.length === 3 && !live.has(parts[1]!);
    };
    return pruneBy(cur, dead);
}

function pruneBy<T extends string[] | Record<string, unknown>>(cur: T, dead: (k: string) => boolean): T {
    if (Array.isArray(cur)) return (cur.some(dead) ? cur.filter((k) => !dead(k)) : cur) as T;
    const keys = Object.keys(cur);
    return (keys.some(dead) ? Object.fromEntries(Object.entries(cur).filter(([k]) => !dead(k))) : cur) as T;
}
