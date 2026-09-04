// 시트 셀 한 칸의 표기(순수) — 무엇을 쓰고 어디에 눈금을 세울지.
//
// 축이 두 종류라 셀도 두 얼굴이다:
//   · **판단 축** — 사람이 꽂은 자리. 가진 건 순서뿐이라 `3/12` 와 **균등 간격** 눈금이 전부다.
//   · **계산 축** — 수식이 정한 값. 값이 있으니 `+12.3%` 를 쓸 수 있고, 눈금도 **값의 실제 자리**에
//     세울 수 있다(필터 보드 레일과 같은 좌표).
//
// ⚠ 두 눈금은 **다른 것을 말한다.** 순위 눈금은 자리를 균등하게 펴므로 12개가 한 곳에 뭉쳐 있어도
// 고르게 퍼져 보인다. 값 눈금은 쏠림이 그대로 보인다 — 대신 순위가 안 보인다. 그래서 고르는 것이지
// 하나가 다른 하나보다 낫지 않다. 판단 축에 값 눈금을 고르면 순위 눈금으로 **폴백**한다: 없는 좌표를
// 지어내느니 있는 좌표를 쓰는 게 정직하다.
import type { RankCell } from "../../lib/rankIndex.js";

/** 셀 표시 모드 — 숫자 · 순위 눈금 · 값 눈금. */
export type CellMode = "number" | "rank" | "value";

export const CELL_MODES: readonly CellMode[] = ["number", "rank", "value"];
export const CELL_MODE_LABEL: Record<CellMode, string> = { number: "숫자", rank: "순위 눈금", value: "값 눈금" };

/** 계산 축이 이 타점에 대해 아는 것 — 값의 자리(0..1)와 그 표기. 판단 축은 이걸 못 준다. */
export interface ValuedCell {
    /** 값 도메인상 0..1(약→강). 레일의 valueToFrac 과 같은 좌표. */
    frac: number;
    /** 축 규격대로 포맷된 값(`+12.3%` · `12일`). */
    text: string;
}

export interface CellView {
    /** 숫자 모드의 주 표기. */
    text: string;
    /** 숫자 모드의 보조 표기(작게·회색). 구분자까지 포함한다. */
    sub: string;
    /** 눈금 위치 0..1. */
    frac: number;
    /** 툴팁 — 모드와 무관하게 아는 걸 다 말한다. */
    title: string;
    /**
     * 숫자 모드의 부호 색(결과 열과 같은 어휘) — **부호가 뜻을 갖는 축에서만** 선다.
     * 판정은 포맷된 글자의 부호로 한다: `+` 는 `signed` 축에서만 찍히므로(formatAxisValue 의 계약),
     * `3,035억`·`236일`·`1h 34m` 처럼 부호가 없는 축은 저절로 색이 안 붙는다 — 큰 값을 빨갛게
     * 칠하는 건 그 축들에선 거짓말이다. 플래그를 따로 실어 나르지 않는 이유가 그거다.
     */
    tone: "rise" | "fall" | null;
}

/**
 * 한 셀의 표기. `valued` 가 있으면 계산 축(값을 아는 축)이다.
 * 값 눈금은 값을 아는 축에서만 값 자리를 쓰고, 아니면 순위 자리로 폴백한다.
 */
export function cellView(cell: RankCell, mode: CellMode, valued?: ValuedCell): CellView {
    const rank = `${cell.rank}/${cell.total}`;
    const frac = mode === "value" && valued ? valued.frac : cell.frac;
    // **숫자 모드에 순위 괄호(`+12.3% (3/12)`)는 없다**(2026-09-04 사용자 확정) — 자동 타점이 만 단위가
    // 되면서 `3/9,869` 같은 순위 **수치**는 읽어도 아무 말을 안 한다(같은 순위가 하루마다 다른 뜻이고,
    // 눈이 분모를 못 쥔다). 순위의 쓸모는 **자리**(눈금 모드)와 툴팁에 남는다 — 그래서 title 은 그대로 다 말한다.
    // 값을 못 아는 축(도메인이 한 점이라 값 좌표가 없는 경우)은 순위가 유일한 정보라 그대로 둔다.
    return valued
        ? { text: valued.text, sub: "", frac, title: `${valued.text} · ${rank}`, tone: toneOf(valued.text) }
        : { text: String(cell.rank), sub: `/${cell.total}`, frac, title: rank, tone: null };
}

const toneOf = (text: string): CellView["tone"] => (text.startsWith("+") ? "rise" : text.startsWith("-") ? "fall" : null);

/**
 * 영속값 읽기 — 옛 저장본은 `posBar: boolean`(true=눈금 / false=숫자)이었다.
 * 그대로 두면 저장된 화면 설정이 조용히 초기화되므로 여기서 옮겨 읽는다.
 */
export function parseCellMode(o: unknown): CellMode | null {
    if (typeof o === "string" && (CELL_MODES as readonly string[]).includes(o)) return o as CellMode;
    if (typeof o === "boolean") return o ? "rank" : "number";
    return null;
}
