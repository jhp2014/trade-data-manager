// 테마 로스터 + 포함관계 — market-eye src/shared/themeView.ts 복사(순수, 의존 0).
// [[chart-stack-architecture]] 원칙대로 렌더 헬퍼는 앱-로컬 소유. 실시간 대신 EOD/시점 스냅샷 위에서 돈다.

interface ThemeStock {
    code: string;
    themes: string[];
    changeRate: number;
}

/** 테마 → 그 테마 멤버를 등락률 desc 정렬(1:N). 등수 = index+1. */
export function stocksByTheme<T extends ThemeStock>(stocks: T[]): Map<string, T[]> {
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
 * "마스크 ⊆ 코로나". 로스터(byTheme)가 시점 스냅샷 기반이면 스크럽에 따라 동적으로 바뀐다.
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
