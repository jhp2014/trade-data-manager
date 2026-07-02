// 테마 보드 순수 로직 — 로스터(테마별 등락률 랭킹) + 포함관계. 외부 import 0(제네릭).
// 원래 market-eye(src/shared/themeView.ts)에서 왔고, 보드가 EOD/시점 스냅샷 위에서 재사용한다.
// 클라(워크벤치)가 이걸 import 해 쓴다 — 순위/포함관계 계산의 단일 진실원본은 domain.

/** 테마 랭킹에 필요한 최소 형태(제네릭 제약). */
export interface ThemeRankable {
    code: string;
    themes: string[];
    changeRate: number;
}

/** 테마 → 그 테마 멤버를 등락률 desc 정렬(1:N). 등수 = index+1. */
export function stocksByTheme<T extends ThemeRankable>(stocks: T[]): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const s of stocks)
        for (const t of s.themes) {
            const list = m.get(t);
            if (list) list.push(s);
            else m.set(t, [s]);
        }
    for (const list of m.values()) list.sort((a, b) => b.changeRate - a.changeRate);
    return m;
}

/**
 * 포함관계 — theme → 이 테마의 멤버를 전부 포함하는 상위 테마들(멤버 많은 순).
 * "마스크 ⊆ 코로나". 로스터가 시점 스냅샷 기반이면 스크럽에 따라 동적으로 바뀐다.
 */
export function themeParents<T extends { code: string }>(byTheme: Map<string, T[]>): Map<string, string[]> {
    const codes = new Map<string, Set<string>>();
    for (const [t, list] of byTheme) codes.set(t, new Set(list.map((s) => s.code)));
    const out = new Map<string, string[]>();
    for (const [t, tc] of codes) {
        if (tc.size === 0) continue;
        const parents: string[] = [];
        for (const [p, pc] of codes) {
            if (p === t || pc.size <= tc.size) continue;
            let sub = true;
            for (const c of tc)
                if (!pc.has(c)) {
                    sub = false;
                    break;
                }
            if (sub) parents.push(p);
        }
        if (parents.length) out.set(t, parents.sort((a, b) => codes.get(b)!.size - codes.get(a)!.size));
    }
    return out;
}

export type RelationKind = "parent" | "child" | "overlap";

/**
 * 한 카드(home)의 관련 테마 — 멤버들이 걸친 다른 ≥2 테마 + 포함관계 종류.
 *  - parent: home ⊆ t (home 이 t 에 포함) / child: t ⊆ home / overlap: 부분 겹침.
 * parent 먼저 → child → overlap 순 정렬. market-eye InfoLine 로직.
 */
export function relatedThemes<T extends { themes: string[] }>(
    home: string,
    homeStocks: readonly T[],
    byTheme: Map<string, unknown[]>,
    parents: Map<string, string[]>,
): { theme: string; kind: RelationKind }[] {
    const myParents = parents.get(home) ?? [];
    const seen = new Set<string>();
    const out: { theme: string; kind: RelationKind }[] = [];
    for (const s of homeStocks)
        for (const t of s.themes) {
            if (t === home || seen.has(t)) continue;
            if ((byTheme.get(t)?.length ?? 0) < 2) continue; // ≥2 멤버 테마만
            seen.add(t);
            const kind: RelationKind = myParents.includes(t)
                ? "parent"
                : (parents.get(t) ?? []).includes(home)
                  ? "child"
                  : "overlap";
            out.push({ theme: t, kind });
        }
    const rank: Record<RelationKind, number> = { parent: 0, child: 1, overlap: 2 };
    out.sort((a, b) => rank[a.kind] - rank[b.kind]);
    return out;
}
