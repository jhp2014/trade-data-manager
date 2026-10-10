// VaultNotes — 복기 vault 의 타점 노트를 읽는 읽기 모델(fs 직독, DB 무관, 쓰기 없음).
// 배치 = apps/api 의 읽기 모델 — core 포트·infra 어댑터를 두지 않는다(소비자 api 하나, 도메인 규칙 없음 —
// gridStore·dataDatesCache 선례. decisions 「복기 노트 [탐색]」). 클라는 경로를 넘기지 못한다 — 뿌리는 생성자 주입 하나.
// 캐시 없음: 노트 수십~수천 장이라 요청마다 읽어도 싸고, Obsidian 에서 고친 게 바로 보여야 한다.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ReviewNote, ReviewNoteIssue, ReviewNotesResponse } from "@trade-data-manager/wire";
import { parseNote } from "./noteFrontmatter.js";

/** 뿌리(저장소 루트) 아래 노트 폴더. */
export const NOTES_SUBDIR = path.join("vault", "타점");

export class VaultNotes {
    /** root = VAULT_DIR(저장소 루트) — null = 미설정. */
    constructor(private readonly root: string | null) {}

    async list(): Promise<ReviewNotesResponse> {
        if (this.root === null) return { vault: "unset" };
        const root = this.root;
        const dir = path.join(root, NOTES_SUBDIR);
        for (const [p, label] of [[root, "VAULT_DIR"], [dir, "vault/타점"]] as const) {
            const st = await fs.stat(p).catch(() => null);
            if (st === null) return { vault: "missing", root, why: `${label} 없음: ${p}` };
            if (!st.isDirectory()) return { vault: "missing", root, why: `${label} 가 폴더가 아님: ${p}` };
        }

        const notes: ReviewNote[] = [];
        const issues: ReviewNoteIssue[] = [];
        for (const rel of await listMarkdown(dir)) {
            // 파일 하나의 실패(Obsidian 이 막 지웠다·Windows 잠금)가 응답 전체를 500 으로 만들면 이미 떠 있던 표가
            // 「조회 실패」로 통째 바뀐다 — 그 노트만 버리고 이유를 남긴다.
            const text = await fs.readFile(path.join(dir, rel), "utf8").catch((e: unknown) => e as Error);
            if (text instanceof Error) { issues.push({ file: rel, why: `읽기 실패 — ${text.message}`, skipped: true }); continue; }
            const r = parseNote(text, rel);
            if ("skip" in r) { issues.push({ file: rel, why: r.skip, skipped: true }); continue; }
            notes.push(r.note);
            for (const why of r.warns) issues.push({ file: rel, why, skipped: false });
        }
        notes.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code) || a.time.localeCompare(b.time));
        return { vault: "ok", root, notes, issues };
    }
}

/** dir 아래 .md 전부(상대 경로, `/` 구분). 점으로 시작하는 폴더·파일과 심볼릭 링크는 건너뛴다. */
async function listMarkdown(dir: string, prefix = ""): Promise<string[]> {
    const out: string[] = [];
    for (const e of await fs.readdir(path.join(dir, prefix), { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
        const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
        if (e.isDirectory()) out.push(...(await listMarkdown(dir, rel)));
        else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(rel);
    }
    return out;
}
