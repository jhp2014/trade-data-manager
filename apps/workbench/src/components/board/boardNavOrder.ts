import type { Grouped, ThemeGroup } from "@trade-data-manager/market/domain";
import type { BoardStock } from "./BoardCard.js";

// 보드의 **순회 순서**(w/s) — 그룹 뷰에서 "보이는 순서대로 걷는다"를 코드 목록 하나로 빚는다.
//
// ## 규칙
// ① 카드 순서 = 즐겨찾기(사람이 정한 순) → 나머지(보드 순). 숨김(👁·자동숨김) 카드는 빠진다 —
//    필터 제외와 함께 **진짜로 없는 것**이다.
// ② 카드 안은 멤버 순서 그대로, **첫 등장만**(한 종목이 여러 테마 카드에 있으므로 dedupe 가 없으면
//    같은 종목을 여러 번 밟는다 — 걷는 사람 눈엔 "안 움직이는" 버그로 보인다).
// ③ 접힘/펼침(카드의 collapsed·movers·all)은 **안 본다**. 접힘은 목록에서 빠진 게 아니라 표시를
//    압축한 것이고(카드 머리의 `주도주/전체` 수가 이미 그걸 세고 있다), 순회로 도착한 종목은
//    승격 밴드가 카드를 펼쳐 보여준다(BoardLayout — 외부 출처 선택 경로).
// ④ 승격 밴드(현재 종목)는 **순서에 안 넣는다**. 밴드는 걸을 때마다 재배열되므로 그걸 순서로 삼으면
//    커서가 제자리를 맴돈다 — 논리 순서(①)는 걷는 동안 흔들리지 않는다.
export function boardNavOrder(
    grouped: Grouped<BoardStock>,
    opts: {
        favorites: readonly string[];
        isHidden: (theme: string) => boolean;
        showIndividuals?: boolean;
        showUnclassified?: boolean;
    },
): string[] {
    const { favorites, isHidden, showIndividuals = true, showUnclassified = true } = opts;
    const byTheme = new Map(grouped.themes.map((g) => [g.theme, g]));
    const favCards = favorites
        .map((t) => byTheme.get(t))
        .filter((g): g is ThemeGroup<BoardStock> => !!g && !isHidden(g.theme));
    const restCards = grouped.themes.filter((g) => !favorites.includes(g.theme) && !isHidden(g.theme));
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (stocks: readonly BoardStock[]): void => {
        for (const s of stocks) {
            if (seen.has(s.code)) continue;
            seen.add(s.code);
            out.push(s.code);
        }
    };
    for (const g of [...favCards, ...restCards]) push(g.stocks);
    if (showIndividuals) push(grouped.individuals);
    if (showUnclassified) push(grouped.unclassified);
    return out;
}

/** 목록 위에서 한 걸음 — 현재 값이 목록에 없으면 끝에서 시작(작업셋 순회와 같은 규약). 목록이 비면 null. */
export function stepInList(list: readonly string[], cur: string | null, dir: 1 | -1): string | null {
    if (list.length === 0) return null;
    const at = cur ? list.indexOf(cur) : -1;
    if (at < 0) return dir > 0 ? list[0] : list[list.length - 1];
    return list[Math.max(0, Math.min(list.length - 1, at + dir))];
}
