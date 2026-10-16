// 텔레그램 결과 다루기(순수) — 페이지 합치기 · 더보기(구간 걷기) · 수집 범위 · 경로 시각 이후 판정.
import type { TelegramArchivePage, TelegramNewsItem } from "../market/types.js";
import { kstDateOfIso, kstHmOfIso } from "../lib/date.js";
import { isAfterPath } from "../lib/pathTime.js";

/**
 * 페이지들 → 한 목록(최신순). 더보기 페이지는 경계 날짜가 겹쳐 올 수 있어 ref 로 중복을 걷는다.
 * 정렬을 다시 하는 건 "경로 시각 이후" 메시지가 목록 맨 위에 몰려 있어야 경계선을 한 곳에 그을 수 있어서다.
 */
export function telegramItems(pages: readonly { items: readonly TelegramNewsItem[] }[] | undefined): TelegramNewsItem[] {
    const seen = new Set<string>();
    const out: TelegramNewsItem[] = [];
    for (const page of pages ?? []) {
        for (const it of page.items) {
            if (seen.has(it.ref)) continue;
            seen.add(it.ref);
            out.push(it);
        }
    }
    // 시각을 읽을 수 없는 메시지는 맨 아래로 — NaN 비교는 정렬을 흐트러뜨리고, 맨 위에 오면 경계선 세기가 거기서 멈춘다.
    const t = (it: TelegramNewsItem): number => {
        const v = Date.parse(it.at);
        return Number.isNaN(v) ? -Infinity : v;
    };
    return out.sort((a, b) => t(b) - t(a));
}

/** 한 번 부를 구간(KST 날짜, 양 끝 포함) — before 는 그 구간이 limit 에 걸려 이어 받을 때. */
export interface TgWindow {
    from: string;
    to: string;
    before?: string;
}

/** 더보기 한 번에 거슬러 가는 날 수 — 주말 뉴스도 들어가게 달력 기준 한 주. */
export const MORE_DAYS = 7;

/** YYYY-MM-DD 에 n 일 더하기(달력). */
export function addDays(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 다음 더보기 구간 — 이 구간이 limit 에 걸렸으면 같은 구간을 이어 받고(before), 아니면 바로 앞 한 주.
 * 수집 범위(coverage)의 시작 날짜보다 앞으로는 가지 않는다(그 앞은 비었거나 불완전 — "없다"가 아니라 "모른다").
 * 수집 범위를 모르면(null) 더 가지 않는다.
 */
export function nextWindow(w: TgWindow, page: Pick<TelegramArchivePage, "nextBefore">, coverage: TelegramArchivePage["coverage"]): TgWindow | undefined {
    if (page.nextBefore) return { from: w.from, to: w.to, before: page.nextBefore };
    if (!coverage) return undefined;
    const start = kstDateOfIso(coverage.from);
    const to = addDays(w.from, -1);
    if (!start || to < start) return undefined;
    const from = addDays(to, -(MORE_DAYS - 1));
    return { from: from < start ? start : from, to };
}

/**
 * 그 날짜가 수집 범위 안인가 — 패널이 빈 결과를 "언급 없음"으로 보이지 않게.
 *  ok = 빠짐없이 들었다(그날 00:00 부터 끝까지 — 서버 archiveCoverage.isDayCovered 와 같은 자)
 *  partial = 그날의 일부만 — 수집 시작일이면 since(HH:MM)부터, 수집 끝 날이면 until(HH:MM)까지(둘 다일 수 있다)
 *  before = 빠짐없는 수집이 아직 그 날까지 못 내려갔다(방마다 백필이 따로라 일부 방만 들었을 수 있다)
 *  after = 아직 안 받은 날 · unknown = 수집이 한 바퀴도 안 돌았다
 * 날짜 · 시각은 KST(coverage 는 UTC ISO). coverage.from = 방마다 가장 오래된 메시지 시각 중 가장 늦은 것(tdm).
 */
export type CoverageState =
    | { kind: "ok" }
    | { kind: "partial"; since?: string; until?: string }
    | { kind: "before"; start: string }
    | { kind: "after" }
    | { kind: "unknown" };

export function coverageOf(date: string, coverage: TelegramArchivePage["coverage"]): CoverageState {
    if (!coverage) return { kind: "unknown" };
    const start = kstDateOfIso(coverage.from);
    const end = kstDateOfIso(coverage.to);
    if (date < start) return { kind: "before", start };
    if (date > end) return { kind: "after" };
    const dayStart = Date.parse(`${date}T00:00:00+09:00`);
    const since = date === start && Date.parse(coverage.from) > dayStart ? kstHmOfIso(coverage.from) : undefined;
    const until = date === end ? kstHmOfIso(coverage.to) : undefined;
    return since || until ? { kind: "partial", ...(since ? { since } : {}), ...(until ? { until } : {}) } : { kind: "ok" };
}

/**
 * 수집 범위 한 줄(헤더) — 빠짐없이 든 날은 null.
 * seen = 그날 메시지가 보였나(before 를 가른다): some = 일부 방만 든 날 · none = 수집 전 · unknown = 검색어로 걸러 비어 모름.
 */
export function coverageLabel(c: CoverageState, seen: "some" | "none" | "unknown" = "unknown"): string | null {
    switch (c.kind) {
        case "ok":
            return null;
        case "partial":
            return c.since && c.until ? `${c.since}~${c.until}만 빠짐없음` : c.since ? `${c.since}부터 빠짐없음(그 앞은 일부 방만)` : `${c.until}까지 빠짐없음`;
        case "before": {
            const what = seen === "some" ? "일부 방만 수집된 날짜" : seen === "none" ? "수집 전 날짜" : "수집 전이거나 일부 방만 든 날짜";
            return `${what} — ${c.start}부터 빠짐없음`;
        }
        case "after":
            return "아직 안 받은 날짜";
        case "unknown":
            return "수집 범위 모름";
    }
}

/**
 * 검색어 중 본문에 없는 낱말이 링크 미리보기에 있으면 그 칸들(제목 · 설명) — 본문만 봐선 왜 잡혔는지 모를 때 보여 준다.
 * tdm 검색은 본문 + 미리보기(제목 · 설명)에서 낱말 전부를 부분 일치로 찾는다. 대소문자는 가리지 않는다.
 * 설명은 길어(100~300자) 맞은 낱말 앞뒤만 잘라 준다 — 접어 보이면 낱말이 잘린 데 숨는다.
 */
export function previewHits(it: TelegramNewsItem, words: readonly string[]): { title?: string; description?: string } | null {
    if (!it.preview) return null;
    const text = it.text.toLowerCase();
    const missing = words.map((w) => w.trim().toLowerCase()).filter((w) => w && !text.includes(w));
    if (!missing.length) return null;
    const has = (s: string | undefined): s is string => !!s && missing.some((w) => s.toLowerCase().includes(w));
    const { title, description } = it.preview;
    if (!has(title) && !has(description)) return null;
    return { ...(has(title) ? { title } : {}), ...(has(description) ? { description: around(description, missing) } : {}) };
}

/** 낱말이 처음 맞은 곳 앞 LEAD 자부터 SPAN 자만 — 잘린 쪽엔 "…". words 는 소문자. */
const LEAD = 20;
const SPAN = 120;
function around(text: string, words: readonly string[]): string {
    const low = text.toLowerCase();
    const hit = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0));
    const start = hit > LEAD ? hit - LEAD : 0;
    const end = Math.min(text.length, start + SPAN);
    return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** 경로 (날짜, 시각)보다 나중 메시지 수 — 최신순 목록의 맨 앞에서부터 센다(사후 정보 경계선 위치). 판정은 lib/pathTime. */
export function telegramLaterCount(items: readonly TelegramNewsItem[], date: string, time: string): number {
    let n = 0;
    while (n < items.length && isAfterPath(kstDateOfIso(items[n].at), kstHmOfIso(items[n].at), date, time)) n++;
    return n;
}
