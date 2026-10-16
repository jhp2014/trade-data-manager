// 이슈 이력 읽기 — trade-judgment 의 이력/<코드>.jsonl 전부와 관점/테마 사전.md 를 메모리에 올린다(임시 판단 서버가 쓴다). 순수 node.
// 형식: trade-judgment/이력/형식.md. 이력의 테마 이름(세부)을 사전으로 테마에 잇는 규칙은 trade-judgment/tools/theme-dict.mjs 와 같다
// (사전 「쓰는 법」 — 같은 이름 → 괄호 속 이름 → 괄호 설명을 뗀 이름 → 끝이 가장 길게 맞는 이름, 상위가 있으면 그것도).
// 이력 · 사전 파일이 바뀌면 다음 요청 때 다시 읽는다(fs.watch).
import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[0-9A-Z]{6}$/;

/** 요청 쪽 잘못(400) · 없음(404). */
export class HistoryError extends Error {
    constructor(
        readonly status: 400 | 404,
        message: string,
    ) {
        super(message);
        this.name = "HistoryError";
    }
}

// ── 테마 사전 ────────────────────────────────────────────────────────────────

const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase();
const cells = (line: string): string[] => line.split("|").slice(1, -1).map((c) => c.trim());
const names = (cell: string | undefined): string[] => (cell ? cell.split("·").map((s) => s.trim()).filter(Boolean) : []);

export interface ThemeDict {
    /** 이력 이름 하나 → 테마들(상위 포함, 안 묶이면 []). */
    resolve(raw: string): string[];
}

/** 사전 글(관점/테마 사전.md) → 이름 맞추기. 표 행 = | 테마 | 이력 이름 · … | 상위 |, 「묶지 않는 이름」 절 = 끝 맞추기로도 안 묶는 이름. */
export function parseThemeDict(text: string): ThemeDict {
    const alias = new Map<string, string>();
    const parent = new Map<string, string | null>();
    const drop = new Set<string>();
    let section = "";
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("## ")) section = line.slice(3).trim();
        if (section === "묶지 않는 이름" && line.trim() && !line.startsWith("#") && !line.startsWith("사전에 없으니")) names(line).forEach((n) => drop.add(norm(n)));
        if (!line.startsWith("|") || /^\|\s*-/.test(line)) continue;
        const [theme, aka, up] = cells(line);
        if (!theme || theme === "테마" || parent.has(theme)) continue;
        parent.set(theme, up || null);
        for (const n of [theme, ...names(aka)]) if (!alias.has(norm(n))) alias.set(norm(n), theme);
    }
    const keys = [...alias.keys()].sort((a, b) => b.length - a.length);
    const find = (raw: string): string | null => {
        const k = norm(raw);
        if (!k || drop.has(k)) return null;
        const hit = alias.get(k);
        if (hit) return hit;
        for (const m of k.matchAll(/\(([^)]*)\)?/g)) {
            const inner = alias.get(m[1]!);
            if (inner) return inner;
        }
        const bare = k.replace(/\([^)]*\)?/g, "").replace(/[()]/g, "");
        if (drop.has(bare)) return null;
        const b = alias.get(bare);
        if (b) return b;
        if ([...drop].some((d) => bare.endsWith(d))) return null;
        const tail = keys.find((a) => a.length >= 2 && bare.endsWith(a));
        return tail ? alias.get(tail)! : null;
    };
    const cache = new Map<string, string[]>();
    return {
        resolve(raw) {
            let out = cache.get(raw);
            if (!out) {
                out = [];
                for (let t = find(raw); t && !out.includes(t); t = parent.get(t) ?? null) out.push(t);
                cache.set(raw, out);
            }
            return out;
        },
    };
}

// ── 이력 ────────────────────────────────────────────────────────────────────

/** 이력 한 줄(그날) — 화면에 필요한 칸만. */
export interface HistoryLine {
    date: string;
    /** 그날 테마 이름(세부 — 이력에 쓴 그대로). */
    details: string[];
    /** 세부를 사전으로 이은 테마(상위 포함). */
    themes: string[];
    issue: string;
    /** 그날 종가 등락 %(주도주시황) — 없으면 null. */
    pct: number | null;
    limitUp: boolean;
    /** 장 마감 정리(주도주시황)의 묶음 이유들. */
    reasons: string[];
    /** 근거 출처(cafe · telegram · hts). */
    sources: string[];
}

export interface ThemeCount {
    theme: string;
    n: number;
    first: string;
    last: string;
    /** 이 테마로 이어진 세부 이름들(자주 쓴 순). */
    details: string[];
}

/** 이력이 덮는 기간(종목 줄 from · to 를 모은 것) — 그 밖은 "없음"이 아니라 "아직 안 봤다". 이력이 하나도 없으면 null. */
export interface Coverage {
    from: string;
    to: string;
}

export interface StockHistory {
    code: string;
    name: string;
    /** 기준일 — 이날 **이전** 이력만 센다. */
    asOf: string;
    /** 기준일의 장 마감 정리(주도주시황) — 장중에는 볼 수 없는 정보. 없으면 null. */
    closing: HistoryLine | null;
    themes: ThemeCount[];
    /** 기준일 이전 줄, 최근 먼저. */
    lines: HistoryLine[];
    coverage: Coverage | null;
}

interface Raw {
    date: string;
    themes: string[];
    issue: string;
    high: number | null;
    evidence: { src?: string; title?: string; pct?: number | null; limitUp?: boolean }[];
}

interface Stock {
    name: string;
    from: string | null;
    to: string | null;
    lines: Raw[]; // 날짜순
}

function parseFile(text: string): Stock | null {
    let name = "";
    let from: string | null = null;
    let to: string | null = null;
    const lines: Raw[] = [];
    for (const l of text.split(/\r?\n/)) {
        if (!l.trim()) continue;
        let r: Record<string, unknown>;
        try {
            r = JSON.parse(l) as Record<string, unknown>;
        } catch {
            continue;
        }
        if (r.kind === "stock") {
            if (typeof r.name === "string") name = r.name;
            if (typeof r.from === "string" && DATE.test(r.from)) from = r.from;
            if (typeof r.to === "string" && DATE.test(r.to)) to = r.to;
        }
        if (r.kind !== "issue" || typeof r.date !== "string" || !DATE.test(r.date)) continue;
        lines.push({
            date: r.date,
            themes: Array.isArray(r.themes) ? r.themes.filter((t): t is string => typeof t === "string") : [],
            issue: typeof r.issue === "string" ? r.issue : "",
            high: typeof r.high === "number" ? r.high : null,
            evidence: Array.isArray(r.evidence) ? (r.evidence as Raw["evidence"]) : [],
        });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
    return name || lines.length ? { name, from, to, lines } : null;
}

function toLine(r: Raw, dict: ThemeDict): HistoryLine {
    const cafe = r.evidence.filter((e) => e.src === "cafe");
    const themes: string[] = [];
    for (const d of r.themes) for (const t of dict.resolve(d)) if (!themes.includes(t)) themes.push(t);
    return {
        date: r.date,
        details: r.themes,
        themes,
        issue: r.issue,
        pct: cafe.find((e) => typeof e.pct === "number")?.pct ?? r.high,
        limitUp: cafe.some((e) => e.limitUp === true),
        reasons: [...new Set(cafe.flatMap((e) => (typeof e.title === "string" ? [e.title] : [])))],
        sources: [...new Set(r.evidence.flatMap((e) => (typeof e.src === "string" ? [e.src] : [])))],
    };
}

/** 기준일 이전 줄로 테마를 센다 — 많이 · 최근 순. */
function countThemes(lines: readonly HistoryLine[]): ThemeCount[] {
    const by = new Map<string, ThemeCount & { det: Map<string, number> }>();
    for (const l of lines)
        for (const t of l.themes) {
            const c = by.get(t) ?? { theme: t, n: 0, first: l.date, last: l.date, details: [], det: new Map() };
            c.n++;
            if (l.date < c.first) c.first = l.date;
            if (l.date > c.last) c.last = l.date;
            for (const d of l.details) c.det.set(d, (c.det.get(d) ?? 0) + 1);
            by.set(t, c);
        }
    return [...by.values()]
        .map(({ det, ...c }) => ({ ...c, details: [...det].sort((a, b) => b[1] - a[1]).map(([d]) => d) }))
        .sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
}

interface Loaded {
    stocks: Map<string, Stock>;
    dict: ThemeDict;
    coverage: Coverage | null;
}

const WATCHED = ["이력", "관점"] as const;

/** 이력 · 사전을 메모리에 들고, 파일이 바뀌면 다음 요청 때 다시 읽는다. */
export class HistoryRepo {
    private data: Promise<Loaded> | null = null;
    private watchers: FSWatcher[] = [];

    constructor(private readonly root: string) {}

    close(): void {
        for (const w of this.watchers) w.close();
        this.watchers = [];
        this.data = null;
    }

    /** 서버가 뜰 때 미리 읽어 둔다(첫 요청이 이력 전부를 읽느라 기다리지 않게). 실패는 첫 요청이 다시 읽으며 드러난다. */
    warm(): void {
        this.load().catch(() => undefined);
    }

    /** 그날 이전 이력으로 종목마다 테마(많이 · 최근 순). 이력이 없거나 묶인 테마가 없는 종목은 빠진다. */
    async themesAsOf(date: string): Promise<{ stocks: Record<string, string[]>; coverage: Coverage | null }> {
        if (!DATE.test(date)) throw new HistoryError(400, `날짜 형식이 아니다: ${date}`);
        const { stocks, dict, coverage } = await this.load();
        const out: Record<string, string[]> = {};
        for (const [code, s] of stocks) {
            const before = s.lines.filter((l) => l.date < date).map((l) => toLine(l, dict));
            const themes = countThemes(before).map((c) => c.theme);
            if (themes.length) out[code] = themes;
        }
        return { stocks: out, coverage };
    }

    /** 한 종목의 이력 — 기준일 이전 줄 · 테마별 셈 · 기준일의 장 마감 정리. 이력 파일이 없으면 404. */
    async stock(code: string, date: string): Promise<StockHistory> {
        if (!CODE.test(code)) throw new HistoryError(400, `종목 코드가 아니다: ${code}`);
        if (!DATE.test(date)) throw new HistoryError(400, `날짜 형식이 아니다: ${date}`);
        const { stocks, dict, coverage } = await this.load();
        const s = stocks.get(code);
        if (!s) throw new HistoryError(404, `이력이 없다: ${code}`);
        const before = s.lines.filter((l) => l.date < date).map((l) => toLine(l, dict));
        const today = s.lines.find((l) => l.date === date);
        const closing = today ? toLine(today, dict) : null;
        return {
            code,
            name: s.name,
            asOf: date,
            closing: closing && closing.sources.includes("cafe") ? closing : null,
            themes: countThemes(before),
            lines: before.reverse(),
            coverage,
        };
    }

    private load(): Promise<Loaded> {
        if (!this.data) {
            const watching = this.watch();
            const p = this.read();
            this.data = p;
            // 읽다 실패하면 — 또는 폴더를 다 지켜보지 못하면(아직 없는 폴더는 바뀜을 알 길이 없다) — 다음 요청이 다시 읽게 비운다.
            p.then(
                () => {
                    if (!watching && this.data === p) this.data = null;
                },
                () => {
                    if (this.data === p) this.data = null;
                },
            );
        }
        return this.data;
    }

    private async read(): Promise<Loaded> {
        const dir = join(this.root, "이력");
        const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^[0-9A-Z]{6}\.jsonl$/.test(f));
        const stocks = new Map<string, Stock>();
        await Promise.all(
            files.map(async (f) => {
                const s = parseFile(await readFile(join(dir, f), "utf8"));
                if (s) stocks.set(f.slice(0, 6), s);
            }),
        );
        const dictText = await readFile(join(this.root, "관점", "테마 사전.md"), "utf8").catch(() => "");
        const froms = [...stocks.values()].flatMap((s) => (s.from && s.to ? [s.from] : [])).sort();
        const tos = [...stocks.values()].flatMap((s) => (s.from && s.to ? [s.to] : [])).sort();
        const coverage: Coverage | null = froms.length ? { from: froms[0]!, to: tos.at(-1)! } : null;
        return { stocks, dict: parseThemeDict(dictText), coverage };
    }

    /** 이력 · 관점 폴더를 본다 — 무엇이든 바뀌면 다음 요청 때 다시 읽는다. 둘 다 지켜보면 true(아니면 읽은 것을 캐시하지 않는다). */
    private watch(): boolean {
        if (this.watchers.length === WATCHED.length) return true;
        this.close();
        for (const sub of WATCHED) {
            try {
                const w = watch(join(this.root, sub), () => {
                    this.data = null;
                });
                w.on("error", () => this.close());
                this.watchers.push(w);
            } catch {
                // 폴더가 없다 — 읽기는 빈 것으로, 다음 요청이 다시 본다.
            }
        }
        return this.watchers.length === WATCHED.length;
    }
}
