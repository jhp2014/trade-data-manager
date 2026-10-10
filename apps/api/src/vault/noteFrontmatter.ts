// vault 타점 노트 한 장 → ReviewNote (순수). 앞머리는 YAML 이 아니라 **`키: 값` 줄**만 읽는다 —
// vault 스크립트(tools/candidates.mjs·gen-point-notes.mjs)가 그렇게 쓰고, Obsidian 속성 편집기도 단일 값은 같은 모양이다.
//
// 함정(테스트가 잠근다):
//  · BOM 을 먼저 벗긴다 — 안 벗기면 첫 줄 `---` 판정이 실패한다. 줄 끝은 CRLF 도 받는다.
//  · **첫 콜론에서만** 자른다 — 시간 값 자체에 `:` 가 있다. 키는 NFC(맥에서 친 한글은 NFD 일 수 있다).
//  · 값: 따옴표 값은 닫는 따옴표까지가 값(뒤 꼬리 주석은 버림), 따옴표 없는 값은 ` #` 뒤 주석을 뗀다. 값도 NFC(CLAUDE.md 예시 `상태: 기록   # 기록 | 아님` 이 복사돼 올 수 있다).
//  · 키가 없거나 값이 비면 null — 옛 라벨 노트엔 상태·감·후보 키가 아예 없다.
//  · 리스트형 값(Obsidian 이 속성 타입을 바꾸면 `키:` 다음 줄 `  - 값`)은 안 읽는다 — 그 칸만 비우고 경고.
//  · 필수 칸(종목코드·날짜·시간)이 깨지면 노트째 버리되 이유를 남긴다(조용히 떨구지 않는다).
import type { ReviewNote, ReviewNoteCandidate, ReviewNoteGam, ReviewNoteState } from "@trade-data-manager/wire";

export const MEMO_HEAD_MAX = 300;

const STATES: readonly ReviewNoteState[] = ["기록", "아님"];
const GAMS: readonly ReviewNoteGam[] = ["할 만함", "애매", "별로"];
const CANDIDATES: readonly ReviewNoteCandidate[] = ["본", "경계", "없음"];

export type ParsedNote = { note: ReviewNote; warns: string[] } | { skip: string };

/**
 * 값 한 칸 — 따옴표 벗기기 · 주석 떼기 · NFC · 빈 값 = null. 따옴표 값은 **닫는 따옴표까지가 값**이고
 * 그 뒤(`"009150"  # 메모`)는 버린다 — 끝이 따옴표인지로 판정하면 꼬리 주석이 붙은 값의 따옴표가 남는다.
 * 값도 NFC 로 — 키만 하면 NFD 로 쓴 `상태: 기록` 이 열거 비교에서 떨어져 「안 본 노트」로 세진다.
 */
function cleanValue(raw: string): string | null {
    let v = raw.trim();
    const q = v[0];
    const close = q === '"' || q === "'" ? v.indexOf(q, 1) : -1;
    if (close > 0) v = v.slice(1, close).trim();
    else {
        const hash = v.search(/\s#/);
        if (hash >= 0) v = v.slice(0, hash).trim();
        else if (v.startsWith("#")) v = "";
    }
    v = v.normalize("NFC");
    return v === "" ? null : v;
}

/** BOM — 안 벗기면 첫 줄 `---` 판정이 실패한다. 코드값으로 비교한다(보이지 않는 문자를 소스에 박지 않게). */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** "9:05" · "09:05" · "09:05:00" → "09:05:00". 범위 밖·모양 틀림 = null. */
export function normalizeTime(v: string): string | null {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v);
    if (!m) return null;
    const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? "0")];
    if (h > 23 || mi > 59 || s > 59) return null;
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${p(h)}:${p(mi)}:${p(s)}`;
}

function validDate(v: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** 열거 칸 — 모르는 값은 그 칸만 null + 경고(노트는 살린다). */
function pickEnum<T extends string>(key: string, v: string | null, allowed: readonly T[], warns: string[]): T | null {
    if (v === null) return null;
    if ((allowed as readonly string[]).includes(v)) return v as T;
    warns.push(`${key} 값 「${v}」 모름 — 비움(${allowed.join(" | ")})`);
    return null;
}

/**
 * 파일명의 종목명 — 노트 이름 = `YY.MM.DD 종목명 HHMM`(2026-10-10~, `26.07.31 LS ELECTRIC 0905.md` → `LS ELECTRIC`).
 * 옛 `YY.MM.DD HHMM 종목명` 도 읽는다. 앞머리 `종목` 이 없을 때만 쓰는 폴백. ⚠ vault tools/common.mjs NOTE_NAME 과 짝.
 */
export const nameFromFile = (relPath: string): string | null => {
    const base = relPath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
    const m = /^\d{2}\.\d{2}\.\d{2} (.+) \d{4}$/.exec(base) ?? /^\d{2}\.\d{2}\.\d{2} \d{4} (.+)$/.exec(base);
    return m?.[1] ?? null;
};

export function parseNote(text: string, relPath: string): ParsedNote {
    const lines = stripBom(text).split(/\r?\n/);
    if (lines[0]?.trimEnd() !== "---") return { skip: "앞머리 없음" };
    const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === "---");
    if (close < 0) return { skip: "앞머리 닫힘 없음" };

    const fm = new Map<string, string | null>();
    const listKeys = new Set<string>();
    let lastKey: string | null = null;
    for (const line of lines.slice(1, close)) {
        if (/^\s+-\s/.test(line) && lastKey !== null) { listKeys.add(lastKey); continue; }
        const c = line.indexOf(":");
        if (c <= 0) { lastKey = null; continue; }
        const key = line.slice(0, c).trim().normalize("NFC");
        lastKey = key;
        if (!fm.has(key)) fm.set(key, cleanValue(line.slice(c + 1))); // 중복 키는 첫 값
    }
    const warns: string[] = [];
    const get = (key: string): string | null => {
        if (listKeys.has(key)) { warns.push(`${key} 이 목록 모양 — 비움`); return null; }
        return fm.get(key) ?? null;
    };

    let code = get("종목코드");
    if (code !== null && /^\d{1,5}$/.test(code)) {
        // 속성 편집기가 숫자로 바꾸면 앞자리 0 이 빠진다 — 계약은 문자열 6자라 채워 살리고 말한다.
        warns.push(`종목코드 「${code}」 를 6자리로 채움`);
        code = code.padStart(6, "0");
    }
    if (code === null || !/^[0-9A-Z]{6}$/.test(code)) return { skip: `종목코드 「${code ?? ""}」 읽을 수 없음` };
    const date = get("날짜");
    if (date === null || !validDate(date)) return { skip: `날짜 「${date ?? ""}」 읽을 수 없음` };
    const rawTime = get("시간");
    const time = rawTime === null ? null : normalizeTime(rawTime);
    if (time === null) return { skip: `시간 「${rawTime ?? ""}」 읽을 수 없음` };

    const memo = lines.slice(close + 1).join("\n").trim();
    const note: ReviewNote = {
        id: relPath,
        code,
        name: get("종목") ?? nameFromFile(relPath),
        date,
        time,
        state: pickEnum("상태", get("상태"), STATES, warns),
        gam: pickEnum("감", get("감"), GAMS, warns),
        candidate: pickEnum("후보", get("후보"), CANDIDATES, warns),
        hasMemo: memo !== "",
        ...(memo !== "" ? { memoHead: memo.length > MEMO_HEAD_MAX ? `${memo.slice(0, MEMO_HEAD_MAX)}…` : memo } : {}),
    };
    return { note, warns };
}
