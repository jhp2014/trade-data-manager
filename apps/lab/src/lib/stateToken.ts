// 일봉 상태 토큰 — `종목@YYYY-MM-DD` + 선 0~2개(`@yymmdd` + O|H|L|C + [:KRX] + ▲|▼).
// 문법 정본은 tdm-ai daily/FORMAT.md — 이 파일은 같은 문법을 읽고(붙여넣기) 쓴다(복사). 순수 함수만.
import type { DailyCandle, PriceMode } from "../market/types.js";

export type LineField = "O" | "H" | "L" | "C";
export type Side = "▲" | "▼";

/** 일봉 선 — 그 날 봉의 시가·고가·저가·종가. venue 는 시장(통합이 기본). */
export interface DailyLine {
    date: string; // YYYY-MM-DD — 상태 날짜보다 앞선 날
    field: LineField;
    venue: PriceMode;
}

export const MAX_LINES = 2;

const BAR_FIELD = { O: "open", H: "high", L: "low", C: "close" } as const;
const FIELDS: readonly LineField[] = ["O", "H", "L", "C"];

/** "260715H" · "260715H:KRX" — 토큰 속 선의 이름(▲▼ 없이). 같은 선인지도 이것으로 가린다. */
export function lineRef(l: DailyLine): string {
    return `${l.date.slice(2).replaceAll("-", "")}${l.field}${l.venue === "krx" ? ":KRX" : ""}`;
}

/** 그 선의 가격 — 그 날 봉이 일봉에 없으면(2년 창 밖·휴장) null. */
export function linePrice(daily: readonly DailyCandle[], l: DailyLine): number | null {
    const c = daily.find((d) => d.date === l.date);
    return c ? Number(c[l.venue][BAR_FIELD[l.field]]) : null;
}

/** 봉의 O/H/L/C 중 price 에 가장 가까운 값 — 차트 클릭 높이를 선으로 붙인다. */
export function nearestField(c: DailyCandle, venue: PriceMode, price: number): LineField {
    let best: LineField = "H";
    let gap = Infinity;
    for (const f of FIELDS) {
        const g = Math.abs(Number(c[venue][BAR_FIELD[f]]) - price);
        if (g < gap) {
            best = f;
            gap = g;
        }
    }
    return best;
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
// 선 칸은 꼴 그대로 좁게 잡는다(글 속 괄호·굵게·조사에 붙어도 읽히게). 선 뒤에 또 `@` 가 이어지면(셋째 선·틀린 선) 토큰째 거절 —
// 틀린 선을 조용히 버리지 않는다.
const TOKEN = /(\d{6})@(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})|((?:@\d{6}[OHLC](?::KRX)?[▲▼])*))(@?)/;

/** 글 속 첫 토큰을 읽는다(앞뒤 글·따옴표·백틱은 무시). 꼴이 틀리면 null. */
export function parseStateToken(text: string): ParsedState | null {
    const m = TOKEN.exec(text);
    if (!m) return null;
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
        lines.push({ date: d, field: f as LineField, venue: krx ? "krx" : "un" });
        if (side === "▲") zone++;
    }
    if (lines.length > MAX_LINES) return null;
    return { code, date, time: null, lines, zone };
}
