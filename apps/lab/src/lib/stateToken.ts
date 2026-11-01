// 일봉 상태 토큰 — `종목@YYYY-MM-DD` + 선 0~3개(`@yymmdd` + O|H|L|C + [:KRX] + ▲|▼).
// 구간 = 맞닿은 두 선(가장 높은 ▲ · 가장 낮은 ▼), 나머지는 곁 선(구간을 좁히지 않는 지도).
// 문법 정본은 tdm-ai daily/FORMAT.md — 이 파일은 같은 문법을 읽고(붙여넣기) 쓴다(복사). 순수 함수만.
import { unFixedBar } from "../market/domain.js";
import type { DailyBar, LabDailyCandle, PriceMode } from "../market/types.js";

export type LineField = "O" | "H" | "L" | "C";
export type Side = "▲" | "▼";

/** 일봉 선 — 그 날 봉의 시가·고가·저가·종가. venue 는 시장(통합이 기본). */
export interface DailyLine {
    date: string; // YYYY-MM-DD — 상태 날짜보다 앞선 날
    field: LineField;
    venue: PriceMode;
}

export const MAX_LINES = 3;

const BAR_FIELD = { O: "open", H: "high", L: "low", C: "close" } as const;

/** "260715H" · "260715H:KRX" — 토큰 속 선의 이름(▲▼ 없이). 같은 선인지도 이것으로 가린다. */
export function lineRef(l: DailyLine): string {
    return `${l.date.slice(2).replaceAll("-", "")}${l.field}${l.venue === "krx" ? ":KRX" : ""}`;
}

/** 선이 읽는 바 — 통합 선은 늘 UN*(유령 체결을 걷은 값)이다(tdm-ai daily/FORMAT.md). UN 원본은 보기 전용. */
const lineBar = (c: LabDailyCandle, venue: PriceMode): DailyBar => (venue === "krx" ? c.krx : unFixedBar(c));

/** 그 선의 가격 — 그 날 봉이 받은 일봉에 없으면(더 앞 덩이·휴장) null. */
export function linePrice(daily: readonly LabDailyCandle[], l: DailyLine): number | null {
    const c = daily.find((d) => d.date === l.date);
    return c ? Number(lineBar(c, l.venue)[BAR_FIELD[l.field]]) : null;
}

/** 선 하나를 더하거나(이미 있으면) 뺀다. 넘치면 먼저 그은 것을 밀어낸다. */
export function toggleLine(lines: readonly DailyLine[], l: DailyLine): DailyLine[] {
    const ref = lineRef(l);
    if (lines.some((x) => lineRef(x) === ref)) return lines.filter((x) => lineRef(x) !== ref);
    return [...lines, l].slice(-MAX_LINES);
}

/** 가격이 낮은 선부터(같으면 날짜가 앞선 것부터) — 토큰의 선 순서. 가격을 모르는 선은 맨 뒤. */
export function sortLines<T extends { line: DailyLine; price: number | null }>(xs: readonly T[]): T[] {
    return [...xs].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.line.date.localeCompare(b.line.date));
}

/**
 * 구간 k — 낮은 선부터 k 개 위(▲), 나머지 아래(▼). 선 n 개면 k = 0(전부 아래) … n(전부 위).
 * 선이 나눈 가격 축의 구간 하나와 ▲▼ 조합이 1:1 이라 구간을 숫자 하나로 들고 다닌다.
 */
export function formatState(code: string, date: string, sorted: readonly { line: DailyLine }[], k: number): string {
    return [`${code}@${date}`, ...sorted.map((x, i) => `${lineRef(x.line)}${i < k ? "▲" : "▼"}`)].join("@");
}

export interface ParsedState {
    code: string;
    date: string;
    /** `종목@날짜 HH:MM`·`종목@날짜THH:MM` 꼴이면 그 시각. 일봉 상태 토큰엔 없다. */
    time: string | null;
    lines: DailyLine[];
    /** ▲ 의 수 = 구간 k(토큰은 낮은 선부터 적으니). 선이 없으면 0. */
    zone: number;
}

const LINE = /(\d{2})(\d{2})(\d{2})([OHLC])(:KRX)?([▲▼])/g;
// 선 칸은 꼴 그대로 좁게 잡는다(글 속 괄호·굵게·조사에 붙어도 읽히게). 선 뒤에 또 `@` 가 이어지면(틀린 선) 토큰째 거절 —
// 틀린 선을 조용히 버리지 않는다.
const TOKEN = /(\d{6})@(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})|((?:@\d{6}[OHLC](?::KRX)?[▲▼])*))(@?)/;

const TOKEN_ALL = new RegExp(TOKEN.source, "g");

/** 맞은 토큰 하나를 읽는다 — 꼴이 틀리면 null. */
function readToken(m: RegExpExecArray | RegExpMatchArray): ParsedState | null {
    const [, code, date, time, lineText = "", trailing] = m;
    if (trailing) return null;
    if (time) return { code, date, time, lines: [], zone: 0 };
    const lines: DailyLine[] = [];
    let zone = 0;
    for (const [, yy, mm, dd, f, krx, side] of lineText.matchAll(LINE)) {
        const d = `20${yy}-${mm}-${dd}`;
        if (d >= date) return null;
        // 토큰은 낮은 선부터 적으니 ▲ 가 앞에 몰린다 — ▼ 다음 ▲ 는 가격 축 위의 한 구간이 아니다
        if (side === "▲" && zone < lines.length) return null;
        if (lines.some((x) => x.date === d && x.field === f && (x.venue === "krx") === !!krx)) return null; // 같은 선 두 번
        lines.push({ date: d, field: f as LineField, venue: krx ? "krx" : "un" });
        if (side === "▲") zone++;
    }
    if (lines.length > MAX_LINES) return null;
    return { code, date, time: null, lines, zone };
}

/** 글 속 첫 토큰을 읽는다(앞뒤 글·따옴표·백틱은 무시). 꼴이 틀리면 null. */
export function parseStateToken(text: string): ParsedState | null {
    const m = TOKEN.exec(text);
    return m ? readToken(m) : null;
}

/** 글 속 토큰을 전부 — 글 속 순서대로, 틀린 꼴은 건너뛴다. token = 글에 적힌 토큰 글자 그대로(토큰 기록의 열쇠). */
export function findStateTokens(text: string): { token: string; state: ParsedState }[] {
    const out: { token: string; state: ParsedState }[] = [];
    for (const m of text.matchAll(TOKEN_ALL)) {
        const state = readToken(m);
        if (state) out.push({ token: m[0], state });
    }
    return out;
}

export const FIELD_LABEL: Record<LineField, string> = { O: "시가", H: "고가", L: "저가", C: "종가" };

/** 구간 이름 — 아래 경계·위 경계(없으면 null)로. 「토큰 복사」 판과 같은 말투: "A ~ B 사이" · "A 위" · "B 아래". */
export function zoneText(below: string | null, above: string | null): string {
    return below && above ? `${below} ~ ${above} 사이` : below ? `${below} 위` : `${above ?? ""} 아래`;
}

/**
 * 선마다 전날 종가 대비 %(lineRef → %) — 기준은 늘 UN*(유령 보정) 전날 종가다. KRX 선도 그 KRX 가격을 이 기준에 댄다
 * (한 줄의 % 가 다 같은 기준이라 서로 견줄 수 있게). 받은 일봉에 선 봉·전날 봉이 없으면 그 선은 빠진다.
 */
export function linePcts(daily: readonly LabDailyCandle[], s: ParsedState): Map<string, number> {
    const out = new Map<string, number>();
    const prev = daily.filter((d) => d.date < s.date).at(-1);
    const base = prev ? Number(unFixedBar(prev).close) : 0;
    if (!base) return out;
    for (const l of s.lines) {
        const p = linePrice(daily, l);
        if (p !== null) out.set(lineRef(l), ((p - base) / base) * 100);
    }
    return out;
}

/** 토큰 기록 판의 선 칸 하나 — 날짜("26/01/07") · 덧말(고가·통합이 아닐 때 "저가 KRX" 꼴) · 상태 날짜까지 거래일 수 · 전날 종가 대비 %. */
export interface LineCell {
    ref: string;
    date: string;
    extra: string;
    /** 상태 날짜까지 거래일 수(전날 = 1) — dayIndex 에 두 날짜가 다 있을 때만. */
    days: number | null;
    /** 전날 종가 대비 %(linePcts) — pcts 를 줬고 그 선이 있을 때만. */
    pct: number | null;
}

/**
 * 선을 칸으로 — 먼 것(옛 날)부터. 구간(▲▼)은 말하지 않는다(고르기는 판단이 아니다).
 * 시각 꼴·선 없는 토큰은 빈 배열(판이 「선 없음」·시각을 따로 쓴다).
 */
export function lineCells(s: ParsedState, dayIndex?: ReadonlyMap<string, number>, pcts?: ReadonlyMap<string, number>): LineCell[] {
    if (s.time) return [];
    const at = dayIndex?.get(s.date);
    return [...s.lines]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((l) => {
            const i = dayIndex?.get(l.date);
            return {
                ref: lineRef(l),
                date: l.date.slice(2).replaceAll("-", "/"),
                extra: [l.field === "H" ? "" : FIELD_LABEL[l.field], l.venue === "krx" ? "KRX" : ""].filter(Boolean).join(" "),
                days: at !== undefined && i !== undefined ? at - i : null,
                pct: pcts?.get(lineRef(l)) ?? null,
            };
        });
}
