// 글자 다루기(순수) — 검색어 강조.

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 강조할 낱말들 → 정규식(아무거나, 대소문자 무시). 빈 낱말은 버리고, 하나도 없으면 null. */
export function highlightRe(words: readonly (string | null | undefined)[]): RegExp | null {
    const ws = words.map((w) => w?.trim() ?? "").filter(Boolean).map(escapeRegExp);
    return ws.length ? new RegExp(ws.join("|"), "gi") : null;
}

/** 글을 강조 조각으로 나눈다 — hit 인 조각만 칠한다. */
export function splitHits(text: string, re: RegExp | null): { text: string; hit: boolean }[] {
    if (!re) return [{ text, hit: false }];
    const out: { text: string; hit: boolean }[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
        const at = m.index ?? 0;
        if (m[0] === "") continue;
        if (at > last) out.push({ text: text.slice(last, at), hit: false });
        out.push({ text: m[0], hit: true });
        last = at + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), hit: false });
    return out;
}
