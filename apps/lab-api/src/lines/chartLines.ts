// lab 저장 선 — 종목마다 파일 하나(`<CHART_LINES_DIR>/<종목코드>.jsonl`, 한 줄 = 선 하나). lab-api 가 쓰는 유일한 곳.
// 정본은 이 파일(2026-10-30 workbench chart_anchors 기준선 컷오버 — 결정 로그 「일봉 판단 학습」). 폴더는 git 저장소 밖이고
// 사용(chart-lines, 로컬 git — 야간 커밋)·개발(chart-lines-dev) 이 다른 폴더라 개발 서버가 사용자 선을 못 고친다.
//
// 쓰기: 그 종목 파일을 통째로 다시 쓴다(임시 파일 → rename, 정렬된 꼴이라 git diff 가 읽힌다). 종목마다 줄을 세워
// 한 프로세스 안의 겹친 쓰기가 서로를 지우지 않게 한다(쓰는 프로세스는 이것 하나뿐).
// 읽기: 파일 mtime 이 같으면 메모리 것을 쓴다 — 손으로 고치거나 다시 옮겨도 다음 요청에서 바로 보인다(재시작 불필요).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LabChartLine } from "@trade-data-manager/wire";
import { assertYmd, BadRequest } from "../market/validation.js";

const FIELDS = new Set(["O", "H", "L", "C"]);
/** HH:MM:SS — 시 00~23, 분·초 00~59. */
const HMS = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
/** Windows 에서 rename 이 잠깐 막힐 때(git·백신·편집기가 대상 파일을 쥐고 있으면 EPERM/EBUSY) 다시 해 보는 횟수·간격. */
const RENAME_TRIES = 5;
const RENAME_WAIT_MS = 60;

/** 좌표 정체 — 같은 값이면 같은 선. */
export const lineId = (l: LabChartLine): string => `${l.chartDate}|${l.anchorDate}|${l.anchorTime ?? ""}|${l.field}|${l.market}`;

/** 요청 body 의 선 하나를 검증해 꼭 그 칸만 남긴다(모르는 칸은 버린다). 틀리면 400. */
export function parseLine(v: unknown): LabChartLine {
    const o = (v ?? {}) as Record<string, unknown>;
    const { chartDate, anchorDate, anchorTime, field, market } = o;
    // 달력 유효성까지(GET ?date= 와 같은 검사 — 2026-02-30 같은 날은 거절)
    assertYmd(typeof chartDate === "string" ? chartDate : undefined, "line.chartDate");
    assertYmd(typeof anchorDate === "string" ? anchorDate : undefined, "line.anchorDate");
    if (typeof chartDate !== "string" || typeof anchorDate !== "string") throw new BadRequest("line 날짜 필수");
    if (anchorDate > chartDate) throw new BadRequest(`선 봉(${anchorDate})이 차트 날짜(${chartDate})보다 뒤입니다`);
    if (anchorTime !== null && (typeof anchorTime !== "string" || !HMS.test(anchorTime))) throw new BadRequest("line.anchorTime 은 null 또는 HH:MM:SS");
    if (typeof field !== "string" || !FIELDS.has(field)) throw new BadRequest("line.field 는 O|H|L|C");
    if (market !== "un" && market !== "krx") throw new BadRequest("line.market 은 un|krx");
    if (anchorTime !== null && market !== "un") throw new BadRequest("분봉 선은 market un 만");
    return { chartDate, anchorDate, anchorTime, field: field as LabChartLine["field"], market };
}

const order = (a: LabChartLine, b: LabChartLine): number => lineId(a).localeCompare(lineId(b));

/** 종목 파일의 본문 — 정렬한 줄들(git diff 가 읽히게). 저장소와 옮기기 스크립트가 같은 꼴로 쓴다. */
export const serializeLines = (lines: readonly LabChartLine[]): string => [...lines].sort(order).map((l) => JSON.stringify(l)).join("\n") + "\n";

/** 임시 파일 → 대상. Windows 에서 다른 프로세스가 대상을 쥐고 있으면 잠깐 막히므로 몇 번 다시 해 본다(원본은 그대로라 끝내 실패해도 손실은 없다). */
async function renameRetry(from: string, to: string): Promise<void> {
    for (let i = 1; ; i++) {
        try {
            await fs.rename(from, to);
            return;
        } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (i >= RENAME_TRIES || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
                await fs.rm(from, { force: true }).catch(() => undefined); // 임시 파일을 남기지 않는다(야간 git add 에 실리지 않게) — 지우기 실패가 원래 오류를 가리지 않게
                throw e;
            }
            await new Promise((r) => setTimeout(r, RENAME_WAIT_MS * i));
        }
    }
}

export interface ChartLineStore {
    /** 그 종목의 선 — chartDate 를 주면 그 차트의 것만. */
    list(code: string, chartDate?: string): Promise<LabChartLine[]>;
    /** 더한다(같은 좌표가 있으면 그대로). 그 차트의 선 목록을 돌려준다. */
    add(code: string, line: LabChartLine): Promise<LabChartLine[]>;
    /** 지운다(없으면 그대로). 그 차트의 선 목록을 돌려준다. */
    remove(code: string, line: LabChartLine): Promise<LabChartLine[]>;
}

export function makeChartLineStore(dir: string): ChartLineStore {
    const cache = new Map<string, { mtimeMs: number; lines: LabChartLine[] }>();
    const queue = new Map<string, Promise<unknown>>();
    const fileOf = (code: string): string => path.join(dir, `${code}.jsonl`);

    const readAll = async (code: string): Promise<LabChartLine[]> => {
        const f = fileOf(code);
        let mtimeMs: number;
        try {
            mtimeMs = (await fs.stat(f)).mtimeMs;
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw e;
        }
        const hit = cache.get(code);
        if (hit && hit.mtimeMs === mtimeMs) return hit.lines;
        const text = await fs.readFile(f, "utf8");
        // 깨진 줄은 건너뛰지 않고 던진다 — 조용히 버리면 다음 쓰기가 그 줄을 지운다.
        const lines = text.split("\n").filter((s) => s.trim() !== "").map((s, i) => {
            try {
                return parseLine(JSON.parse(s));
            } catch (err) {
                throw new Error(`${f}:${i + 1} 줄을 읽을 수 없다 — ${err instanceof Error ? err.message : String(err)}`);
            }
        });
        cache.set(code, { mtimeMs, lines });
        return lines;
    };

    const writeAll = async (code: string, lines: LabChartLine[]): Promise<void> => {
        const f = fileOf(code);
        const sorted = [...lines].sort(order);
        if (sorted.length === 0) {
            await fs.rm(f, { force: true });
            cache.delete(code);
            return;
        }
        await fs.mkdir(dir, { recursive: true });
        const tmp = `${f}.tmp`;
        await fs.writeFile(tmp, serializeLines(sorted), "utf8");
        await renameRetry(tmp, f);
        cache.set(code, { mtimeMs: (await fs.stat(f)).mtimeMs, lines: sorted });
    };

    /** 종목마다 줄 세우기 — 앞 쓰기가 끝난 뒤에 읽고-고치고-쓴다. */
    const serial = <T>(code: string, job: () => Promise<T>): Promise<T> => {
        const prev = queue.get(code) ?? Promise.resolve();
        const next = prev.then(job, job);
        queue.set(code, next.catch(() => undefined));
        return next;
    };

    const ofChart = (lines: LabChartLine[], chartDate: string): LabChartLine[] => lines.filter((l) => l.chartDate === chartDate);

    return {
        list: async (code, chartDate) => {
            const all = await readAll(code);
            return chartDate === undefined ? all : ofChart(all, chartDate);
        },
        add: (code, line) =>
            serial(code, async () => {
                const all = await readAll(code);
                if (all.some((l) => lineId(l) === lineId(line))) return ofChart(all, line.chartDate);
                const next = [...all, line].sort(order); // GET 과 같은 순서로 돌려준다
                await writeAll(code, next);
                return ofChart(next, line.chartDate);
            }),
        remove: (code, line) =>
            serial(code, async () => {
                const all = await readAll(code);
                const next = all.filter((l) => lineId(l) !== lineId(line));
                if (next.length !== all.length) await writeAll(code, next);
                return ofChart(next, line.chartDate);
            }),
    };
}
