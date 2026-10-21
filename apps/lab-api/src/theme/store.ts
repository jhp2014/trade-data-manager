// 테마 저장소 적재 — 판단 작업장 tdm-ai(경로는 env TDM_AI_DIR)의 파일을 **읽기만** 해서 메모리에 든다.
// 기동 때 1회 적재, 감시(watch)·reload 없음 — 테마 기록은 자주 안 바뀌므로 반영 = 서버 재시작(사용자 결정 2026-10-18).
// 읽는 것(정본은 tdm-ai, 칸 정의도 그쪽 문서가 집):
//   judgments/theme/keywords.jsonl — 테마 키워드 등록부(테마·큰/세부·소속·같은 말·성격) · judgments/INDEX.md (사람이 승인한 데이터 급)
//   facts/theme/moves/<코드>.jsonl   — 종목별 움직인 날 · facts/FORMAT.md
//   facts/theme/rosters/<테마>.jsonl — 테마별 구성 스냅샷 · facts/FORMAT.md
// 깨진 줄은 건너뛰지 않고 throw — 데이터는 기계 생성이라, 틀리면 tdm-ai 쪽 파서를 고쳐 재생성하는 게 맞다.
// 등록부·움직인 날의 모양은 wire 의 /theme 계약(labTheme.ts)이 단일 출처 — 적재가 곧 응답 모양이다.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { MoveIssue, StockMoves, ThemeKeyword } from "@trade-data-manager/wire";

/** 테마구성의 스냅샷 줄 — 그날 그 테마 명단. */
export interface RosterSnapshot {
    date: string;
    /** "오늘의테마"(E) · "정배열"(G). */
    type: string;
    /** 테마 이름(그때 쓰인 그대로). */
    theme: string;
    stocks: string[];
    unmatched: string[];
    time: string;
    refs: string[];
    headline?: string;
}

export interface ThemeStore {
    keywords: ThemeKeyword[];
    /** 이름(테마·같은 말, 띄어쓰기·대소문자 무시) → 등록된 테마 이름. 없으면 null = 미등록(이벤트 자동). */
    themeOf: (name: string) => string | null;
    /** 종목코드 → 움직인 날. */
    movesByCode: Map<string, StockMoves>;
    /** 테마 원 이름 → 스냅샷(날짜 오름차순) — 파일 단위가 아니라 줄의 theme 칸 기준. */
    rostersByTheme: Map<string, RosterSnapshot[]>;
}

const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

async function readJsonl(file: string): Promise<unknown[]> {
    const text = await fs.readFile(file, "utf8");
    try {
        return text
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l) as unknown);
    } catch (err) {
        throw new Error(`jsonl 파싱 실패: ${file} — ${err instanceof Error ? err.message : String(err)}`);
    }
}

async function listJsonl(dir: string): Promise<string[]> {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f));
}

/** tdm-ai 작업장에서 등록부·facts 를 읽어 메모리 저장소를 만든다(1회성 — reload 없음). */
export async function loadThemeStore(tdmAiDir: string): Promise<ThemeStore> {
    // 등록부
    const keywords = (await readJsonl(path.join(tdmAiDir, "judgments/theme/keywords.jsonl"))) as ThemeKeyword[];
    const nameMap = new Map<string, string>();
    for (const k of keywords) for (const n of [k.theme, ...k.aliases]) nameMap.set(norm(n), k.theme);

    // 움직인 날 — 파일 하나 = 종목 하나(첫 줄 stock, 나머지 issue — 날짜순은 생성기가 보장)
    const movesByCode = new Map<string, StockMoves>();
    for (const file of await listJsonl(path.join(tdmAiDir, "facts/theme/moves"))) {
        const rows = (await readJsonl(file)) as Array<Record<string, unknown>>;
        const head = rows[0];
        if (head?.kind !== "stock") throw new Error(`종목 줄이 첫 줄이 아니다: ${file}`);
        movesByCode.set(head.code as string, {
            code: head.code as string,
            name: head.name as string,
            from: head.from as string,
            to: head.to as string,
            issues: rows.slice(1).map((r) => ({
                date: r.date as string,
                themes: (r.themes ?? []) as string[],
                issue: (r.issue ?? "") as string,
                evidence: (r.evidence ?? []) as MoveIssue["evidence"],
            })),
        });
    }

    // 구성 스냅샷 — 파일명 치환이 겹치면 한 파일에 두 테마가 살 수 있으므로 줄의 theme 칸으로 가른다
    const rostersByTheme = new Map<string, RosterSnapshot[]>();
    for (const file of await listJsonl(path.join(tdmAiDir, "facts/theme/rosters"))) {
        for (const r of (await readJsonl(file)) as Array<Record<string, unknown>>) {
            if (r.kind !== "snapshot") continue;
            const snap: RosterSnapshot = {
                date: r.date as string,
                type: r.type as string,
                theme: r.theme as string,
                stocks: (r.stocks ?? []) as string[],
                unmatched: (r.unmatched ?? []) as string[],
                time: (r.time ?? "") as string,
                refs: (r.refs ?? []) as string[],
                headline: r.headline as string | undefined,
            };
            const list = rostersByTheme.get(snap.theme);
            if (list) list.push(snap);
            else rostersByTheme.set(snap.theme, [snap]);
        }
    }
    for (const list of rostersByTheme.values()) list.sort((a, b) => a.date.localeCompare(b.date));

    return { keywords, themeOf: (name) => nameMap.get(norm(name)) ?? null, movesByCode, rostersByTheme };
}
