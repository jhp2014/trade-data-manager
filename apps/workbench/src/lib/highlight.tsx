// 검색어 하이라이트 공용 — 여러 키워드를 각각 다른 색 칩으로 강조(HTS 뉴스식).
// 구분자는 파이프 `|` (= OR). 가설 텍스트가 `키: 값 | 키: 값` 꼴이라, "일봉|테마"로 검색하면
// 각 key 가 서로 다른 색으로 칠해져 값들을 빠르게 스캔할 수 있다. 입력은 리터럴 취급(escapeRegExp).
import type { ReactNode } from "react";
import { escapeRegExp } from "./text.js";

// 키워드별 배경색(흰 글자). 순서대로 배정, 넘치면 순환. 솔리드라 라이트/다크 무관.
export const HL_COLORS = ["#1D9E75", "#BA7517", "#7F77DD", "#D4537E", "#378ADD", "#639922", "#D85A30"];

export interface HlToken {
    text: string;
    color: string;
}

// 검색 문자열 → 토큰 목록. `|` 로 분리, 트림, 빈/중복(대소문자 무시) 제거, 색 순서대로 배정.
export function parseSearchTokens(search: string): HlToken[] {
    const seen = new Set<string>();
    const out: HlToken[] = [];
    for (const raw of search.split("|")) {
        const t = raw.trim();
        if (!t) continue;
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ text: t, color: HL_COLORS[out.length % HL_COLORS.length] });
    }
    return out;
}

// 토큰 목록 → 매칭용 정규식. 긴 토큰 우선(부분 겹침 시 더 긴 매치). 없으면 null.
export function buildTokenRe(tokens: HlToken[]): RegExp | null {
    if (tokens.length === 0) return null;
    const sorted = [...tokens].sort((a, b) => b.text.length - a.text.length);
    return new RegExp(`(${sorted.map((t) => escapeRegExp(t.text)).join("|")})`, "gi");
}

// 텍스트의 매치 구간을 토큰 색 칩으로 강조. re 는 buildTokenRe 결과.
// ⚠ matchAll 은 넘긴 re 의 lastIndex 를 "복사"해 그 지점부터 훑는다(matchesTokens 의 test() 가 전진시킨 값이
//   샐 수 있음). 반드시 0 으로 리셋 후 훑어야 앞쪽 매치를 놓치지 않는다.
export function highlightTokens(text: string, tokens: HlToken[], re: RegExp | null): ReactNode[] {
    if (!re || tokens.length === 0) return [text];
    const colorOf = (s: string): string => tokens.find((t) => t.text.toLowerCase() === s.toLowerCase())?.color ?? HL_COLORS[0];
    const nodes: ReactNode[] = [];
    let last = 0;
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
        const idx = m.index ?? 0;
        if (idx > last) nodes.push(text.slice(last, idx));
        nodes.push(
            <span key={idx} style={{ background: colorOf(m[0]), color: "#fff", fontWeight: 600, borderRadius: 3, padding: "0 3px" }}>
                {m[0]}
            </span>,
        );
        last = idx + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

// 텍스트가 어느 토큰이든 걸리는지(비매치 흐리게용). g 플래그 test 는 lastIndex 전진 → 매번 리셋.
export function matchesTokens(text: string, re: RegExp | null): boolean {
    if (!re) return true;
    re.lastIndex = 0;
    return re.test(text);
}
