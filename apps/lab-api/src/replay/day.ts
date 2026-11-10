// 장중 복기 분류의 하루 — 판단 작업장 tdm-ai(경로는 env TDM_AI_DIR)의 장부를 **읽기만** 한다.
//   theme/replay/curated/<YYYY-MM-DD>.jsonl — 한 줄이 종목 하나(꼴·칸 뜻은 tdm-ai theme/replay/replay.md 「저장과 고치는 법」)
//   theme/replay/renames.jsonl              — 이름 바꾸기 {from, to}(by:user). 지난 날짜를 고쳐 쓰지 않고 **읽을 때 겹쳐 쓴다**
// 요청마다 읽되 파일 mtime 이 같으면 지난 결과를 쓴다(파일이 작다 — 장부를 고치면 다음 요청에 바로 보인다, 재시작 불요).
// 이름 바꾸기 · 같은 이름표 합치기의 뜻은 tdm-ai tools/analyze/replay-lib.mjs(label · tag · parts)와 replay-review.mjs(merged)를 옮겼다
// — 저장소를 건너 import 하지 않는다(그쪽이 바뀌면 여기도 함께).
// 깨진 줄은 건너뛰지 않고 throw(→ 500) — 장부를 고치는 게 맞다(옛 테마 저장소 적재와 같은 결).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LabReplayDay, LabReplayLabel, LabReplayStock } from "@trade-data-manager/wire";

/** 그날 장부 → 응답. 장부 파일이 없으면 null(아직 분류 안 한 날 — 라우트가 404). */
export type ReplayDayReader = (date: string) => Promise<LabReplayDay | null>;

/** 장부 항목 — pre·close 공통 칸만(ride 의 속·ref·gap 은 응답에 안 싣는다). basis 는 옛 꼴이면 문자열. */
export interface LedgerEntry {
    theme: string;
    sub?: string;
    basis?: string | string[];
    since?: string;
}
export interface LedgerRow {
    code: string;
    name?: string;
    pre?: LedgerEntry[];
    close?: LedgerEntry[];
    why?: string;
}
interface Rename {
    from: string;
    to: string;
}

/** 사슬 상한 — 이름 바꾸기가 고리를 이뤄도 멈춘다(replay-lib 과 같은 10). */
const CHAIN_MAX = 10;

function parseJsonl(text: string, file: string): unknown[] {
    return text
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => {
            try {
                return JSON.parse(l) as unknown;
            } catch (e) {
                throw new Error(`jsonl 파싱 실패: ${file}:${i + 1} — ${e instanceof Error ? e.message : String(e)}`);
            }
        });
}

/** 옛 꼴(basis 문자열)도 목록으로 — replay-lib bases(). */
const basesOf = (e: LedgerEntry): string[] => ([] as unknown[]).concat(e.basis ?? []).filter((b): b is string => typeof b === "string");

/** 이름 바꾸기 — from 에 「/」가 없으면 상위·세부 이름 바꾸기(사슬), 있으면 이름표(상위/세부) 통째 바꾸기. */
export function makeTagger(renames: readonly Rename[]): (e: { theme: string; sub?: string }) => string {
    const names = new Map(renames.filter((r) => !r.from.includes("/")).map((r) => [r.from, r.to]));
    const tags = new Map(renames.filter((r) => r.from.includes("/")).map((r) => [r.from, r.to]));
    const label = (t: string): string => {
        let x = t;
        for (let k = 0; k < CHAIN_MAX && names.has(x); k++) x = names.get(x)!;
        return x;
    };
    return (e) => {
        let t = label(e.theme) + (e.sub ? `/${label(e.sub)}` : "");
        for (let k = 0; k < CHAIN_MAX && tags.has(t); k++) t = tags.get(t)!;
        return t;
    };
}

/** 이름표 → 상위 · 세부(첫 「/」에서 가른다). */
const partsOf = (tag: string): { theme: string; sub?: string } => {
    const i = tag.indexOf("/");
    return i < 0 ? { theme: tag } : { theme: tag.slice(0, i), sub: tag.slice(i + 1) };
};

/** 테마 없음 — 이름표가 아니라 「테마를 못 정함」이다. 보드에서 카드로 묶이면 안 되니 이름표로 내보내지 않는다(→ 미분류). */
const isNone = (e: LedgerEntry, t: string): boolean => t === "테마 없음" || basesOf(e).includes("none");

/**
 * 한 목록 안에서 같은 이름표가 된 항목을 하나로 — 근거는 합집합. 보이는 시각은 가장 이른 쪽:
 * 항목 하나라도 개장부터 보이면(당일 이슈 아님 · 편승 · 시각 없음) open, 아니면 since 중 가장 이른 것.
 */
function mergeByTag(list: readonly LedgerEntry[] | undefined, tagOf: (e: LedgerEntry) => string): Map<string, { basis: string[]; open: boolean; since?: string }> {
    const m = new Map<string, { basis: string[]; open: boolean; since?: string }>();
    for (const e of list ?? []) {
        const t = tagOf(e);
        if (isNone(e, t)) continue;
        const b = basesOf(e);
        const x = m.get(t) ?? { basis: [], open: false };
        for (const v of b) if (!x.basis.includes(v)) x.basis.push(v);
        if (!b.includes("issue") || b.includes("ride") || !e.since) x.open = true; // 편승은 처음부터(사용자 결정 2026-11-10)
        else if (!x.since || e.since < x.since) x.since = e.since;
        m.set(t, x);
    }
    return m;
}

/**
 * 장부 한 줄 → 응답 줄. 이름표 = 장 마감 ∪ 장 전(장 마감 순서 먼저, 장 전에만 있는 것은 뒤).
 * from — 장 전에 있던 이름표 · 당일 이슈 근거가 없는 장 마감 이름표(편승 · 연장선 · 기본) · 편승이 섞인 이름표 · 시각 없는 것은 "open",
 * 그 밖(장중 글로 새로 붙은 당일 이슈)은 그 글 시각 since(합친 항목이면 가장 이른 것). 테마 없음은 내보내지 않는다(→ 미분류).
 */
export function normalizeRow(row: LedgerRow, tagOf: (e: { theme: string; sub?: string }) => string): LabReplayStock {
    const pre = mergeByTag(row.pre, tagOf);
    const close = mergeByTag(row.close, tagOf);
    const labels: LabReplayLabel[] = [];
    for (const t of new Set([...close.keys(), ...pre.keys()])) {
        const c = close.get(t);
        const p = pre.get(t);
        const basis = [...(c?.basis ?? [])];
        for (const b of p?.basis ?? []) if (!basis.includes(b)) basis.push(b);
        const from = p || !c || c.open || !c.since ? "open" : c.since;
        labels.push({ ...partsOf(t), basis, from });
    }
    return { code: row.code, name: row.name ?? "", labels, why: row.why ?? "" };
}

function assertRow(v: unknown, file: string): LedgerRow {
    const r = v as LedgerRow | null;
    const entriesOk = (l: unknown) => l === undefined || (Array.isArray(l) && l.every((e) => e && typeof (e as LedgerEntry).theme === "string"));
    if (!r || typeof r !== "object" || typeof r.code !== "string" || !entriesOk(r.pre) || !entriesOk(r.close)) {
        throw new Error(`장부 줄 꼴이 아님(code·pre·close): ${file} — ${JSON.stringify(v).slice(0, 120)}`);
    }
    return r;
}

/** 파일 mtime — 없으면 null. */
async function mtimeOf(file: string): Promise<number | null> {
    try {
        return (await fs.stat(file)).mtimeMs;
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
    }
}

/** 기억해 둘 날짜 수 — 하루 수백 줄이라 작다. 넘으면 가장 먼저 넣은 것부터 버린다. */
const CACHE_MAX = 64;

/** tdm-ai 작업장 경로 → 그날 장부 읽기. 장부 · 이름 바꾸기 둘 다 mtime 이 같으면 지난 결과를 그대로 쓴다. */
export function makeReplayDayReader(tdmAiDir: string): ReplayDayReader {
    const ledgerDir = path.join(tdmAiDir, "theme/replay/curated");
    const renamesFile = path.join(tdmAiDir, "theme/replay/renames.jsonl");
    const cache = new Map<string, { key: string; day: LabReplayDay }>();
    let renames: { mtime: number | null; tagOf: (e: { theme: string; sub?: string }) => string } | null = null;

    const tagger = async (mtime: number | null) => {
        if (renames && renames.mtime === mtime) return renames.tagOf;
        const rows = mtime === null ? [] : parseJsonl(await fs.readFile(renamesFile, "utf8"), renamesFile);
        const list = rows.filter((r): r is Rename => !!r && typeof (r as Rename).from === "string" && typeof (r as Rename).to === "string");
        renames = { mtime, tagOf: makeTagger(list) };
        return renames.tagOf;
    };

    return async (date) => {
        const file = path.join(ledgerDir, `${date}.jsonl`);
        const [dayMtime, renMtime] = await Promise.all([mtimeOf(file), mtimeOf(renamesFile)]);
        if (dayMtime === null) return null;
        const key = `${dayMtime}|${renMtime}`;
        const hit = cache.get(date);
        if (hit && hit.key === key) return hit.day;
        const tagOf = await tagger(renMtime);
        const rows = parseJsonl(await fs.readFile(file, "utf8"), file).map((v) => normalizeRow(assertRow(v, file), tagOf));
        const day: LabReplayDay = { date, rows };
        cache.delete(date);
        cache.set(date, { key, day });
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
        return day;
    };
}
