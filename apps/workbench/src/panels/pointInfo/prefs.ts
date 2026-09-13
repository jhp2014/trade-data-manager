// 타점 정보 패널의 **순서·숨김 규칙**(순수). 시트 열 설정과 같은 관용구를 쓰되, 생사 판정이 다르다.
//
// ⚠ **이 파일의 존재 이유는 청소 사고 하나다.** 테마 줄은 시선 종목을 따라 갈리므로, 시트식
// "지금 목록에 없으면 유령"을 그대로 베끼면 **종목을 옮길 때마다 남의 테마 키가 영구 삭제된다**.
// `th:` 의 생사 기준은 언제나 **전체 테마 목록**이고, 재료가 안 왔으면 아예 안 돈다.
// 같은 이유로 드래그는 저장 순서 위에서 **한 칸 이동**이고(화면 목록 통째 베끼기 금지),
// 키를 지우는 건 청소 한 곳뿐이다(시트 `reorderCol` 주석과 같은 규율).
import { retainHidden } from "../../lib/axisPrefs.js";
import { dropSide, orderByPref, placeCol } from "../rank/sheetColumns.js";
import type { PointInfoRow } from "./rows.js";

/** 순서 pref — 열 순서(`wb.rankSheetColOrder`)와 **딴 저장물**이다(모수도 화면도 다르다). */
export const ORDER_KEY = "wb.pointInfoOrder";
export const HIDDEN_KEY = "wb.pointInfoHidden";
/** 드래그 미디어타입 — 화면끼리 갈라 둔다(시트 `x-rank-col`·레일 `x-filter-axis`와 섞이면 안 된다). */
export const ROW_DND = "application/x-point-info-row";

export const parseKeys = (o: unknown): string[] | null =>
    Array.isArray(o) && o.every((k) => typeof k === "string") ? (o as string[]) : null;

/** 사용자 순서를 기본 순서(축→결과→테마)에 입힌다. */
export const orderRows = (rows: readonly PointInfoRow[], pref: readonly string[]): PointInfoRow[] =>
    orderByPref(rows, (r) => r.key, pref);

/**
 * 드래그 한 번 — **방향은 화면 순서**(손이 움직인 줄)로 읽고 **이동은 전체 순서** 위에서 한 칸만 한다.
 * 본문에 없는 줄(서랍에 든 값 없음·숨김, 다른 종목의 테마)의 자리는 `retainHidden` 이 되끼운다 —
 * 드래그가 키를 지우면 그 줄들이 다음에 맨 뒤로 밀린다.
 * 바뀔 게 없으면 null(쓸데없는 저장 안 하게).
 */
export function moveRow(
    prev: readonly string[],
    allKeys: readonly string[],
    shownKeys: readonly string[],
    dragged: string,
    target: string,
): string[] | null {
    const side = dropSide(shownKeys, dragged, target);
    if (side === null) return null;
    const next = placeCol(allKeys, dragged, target, side);
    return next === null ? null : retainHidden(next, prev, new Set(prev));
}

/** 살아 있는 주소 — 청소의 기준. `out:` 은 붙박이라 목록이 필요 없다(절대 안 지운다). */
export interface LiveKeys {
    /** 축 키 전부 — 화면에 안 선 보호 축(격자 로딩 창·급타점 인스턴스)까지 포함해서 줄 것. */
    axisKeys: readonly string[];
    /** **전체** 테마 이름 — 시선 종목의 테마가 아니다(위 ⚠). */
    themes: readonly string[];
}

/**
 * 유령 키 청소 — 바뀔 게 없으면 **같은 배열**을 돌려준다(영속 쓰기가 안 돌게).
 * 호출부는 재료가 다 온 뒤에만 부른다: 축·테마가 서로 다른 시각에 도착하므로, 한쪽만 온 순간에 돌면
 * 아직 안 온 쪽의 키를 전부 유령으로 오인한다(시트가 겪은 사고와 같은 모양).
 */
export function pruneRowKeys(cur: readonly string[], live: LiveKeys): string[] {
    const axes = new Set(live.axisKeys.map((k) => `ax:${k}`));
    const themes = new Set(live.themes.map((t) => `th:${t}`));
    const dead = (k: string): boolean =>
        (k.startsWith("ax:") && !axes.has(k)) || (k.startsWith("th:") && !themes.has(k));
    const next = cur.filter((k) => !dead(k));
    return next.length === cur.length ? (cur as string[]) : next;
}
