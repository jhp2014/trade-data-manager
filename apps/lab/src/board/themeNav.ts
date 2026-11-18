// 테마 보드 w/s 순회의 산수 — 순수 함수만. 선택 테마는 판의 커서다(경로·토큰에 없다 — decisions 「lab w/s 순회」).
//   · 걷는 카드: 저장한 선택 테마가 현재 종목의 테마면 그것, 아니면 현재 종목의 첫 테마(띠 순서),
//     현재 종목이 어느 테마 카드에도 없으면 저장한 선택 테마 카드 그대로(있으면).
//   · w/s = 그 카드에 보이는 순서로 한 줄, 끝에서 순환. shift+w/s = 현재 종목의 테마들 사이 순환.
import type { Grouped, ThemeGroup } from "./domain.js";
import type { BoardStock } from "./boardTypes.js";
import type { NavDir } from "../store/rowNav.js";

/** 현재 종목이 든 테마 카드들 — 보드의 카드 순서(= 띠 순서). */
export function themesOf(grouped: Grouped<BoardStock>, code: string): ThemeGroup<BoardStock>[] {
    return code ? grouped.themes.filter((g) => g.stocks.some((s) => s.code === code)) : [];
}

/** w/s 가 걷는 카드 — 없으면 null(현재 종목이 테마 밖이고 선택 테마도 그날 없음). */
export function navCard(grouped: Grouped<BoardStock>, code: string, pref: string): ThemeGroup<BoardStock> | null {
    const mine = themesOf(grouped, code);
    return mine.find((g) => g.theme === pref) ?? mine[0] ?? grouped.themes.find((g) => g.theme === pref) ?? null;
}

/** 카드 안 줄 순서 — 주도주(등락 기준 · 1분 신호) 먼저, 나머지 뒤. 카드 그리기와 w/s 순회가 같은 순서를 쓴다. */
export function cardSections<T extends Pick<BoardStock, "isMover" | "signal">>(stocks: readonly T[]): { movers: T[]; rest: T[] } {
    const movers = stocks.filter((s) => s.isMover || s.signal); // 신호 종목은 등락률 낮아도 주도주로 승격
    const rest = stocks.filter((s) => !(s.isMover || s.signal));
    return { movers, rest };
}

/** 카드에 보이는 순서 그대로의 한 줄 — w/s 가 걷는 순서. */
export function cardOrder<T extends Pick<BoardStock, "isMover" | "signal">>(stocks: readonly T[]): T[] {
    const { movers, rest } = cardSections(stocks);
    return [...movers, ...rest];
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

/** 카드 안 다음 종목 — 끝에서 처음으로. 현재 종목이 카드 밖이면 s = 첫 줄, w = 끝 줄. */
export function stepInCard(stocks: readonly BoardStock[], code: string, dir: NavDir): string | null {
    const order = cardOrder(stocks);
    if (order.length === 0) return null;
    const i = order.findIndex((s) => s.code === code);
    if (i < 0) return order[dir === 1 ? 0 : order.length - 1].code;
    return order[wrap(i + dir, order.length)].code;
}

/**
 * 현재 종목의 테마들 사이 다음 테마 — 끝에서 처음으로. 바꿀 테마가 없으면(하나뿐 · 지금 테마가 목록 밖) null.
 * 걷는 카드(navCard)는 현재 종목에 테마가 있으면 늘 그 안에서 고르므로 「목록 밖」은 테마가 없을 때뿐이다.
 */
export function stepTheme(themes: readonly string[], current: string | null, dir: NavDir): string | null {
    const i = current === null ? -1 : themes.indexOf(current);
    return i >= 0 && themes.length > 1 ? themes[wrap(i + dir, themes.length)] : null;
}
