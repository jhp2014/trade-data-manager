// 적재 로직만 본다(임시 폴더에 작은 tdm-ai 모양을 만든다) — 등록부 이름 흡수·moves/rosters 적재·깨진 줄 fail-fast.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadThemeStore } from "./store.js";

let dir: string;

const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

async function seed() {
    await mkdir(join(dir, "theme"), { recursive: true });
    await mkdir(join(dir, "theme/raw/moves"), { recursive: true });
    await mkdir(join(dir, "theme/raw/rosters"), { recursive: true });
    await writeFile(
        join(dir, "theme/keywords.jsonl"),
        jsonl([
            { theme: "반도체", kind: "standing", aliases: ["반도체/소부장", "AI반도체", "HBM", "반도체/HBM"] },
            { theme: "중동", kind: "transient", aliases: ["중동 전쟁"] },
        ]),
    );
    await writeFile(
        join(dir, "theme/raw/moves/000001.jsonl"),
        jsonl([
            { v: 1, kind: "stock", id: "stock", code: "000001", name: "가나다", from: "2023-01-01", to: "2026-10-16" },
            {
                v: 1,
                kind: "issue",
                id: "2026-07-31",
                date: "2026-07-31",
                themes: ["반도체/소부장"],
                issue: "이유",
                high: null,
                evidence: [{ src: "awake", date: "2026-07-31", time: "10:00", title: "#반도체/소부장", ref: "@x#1", pct: 5 }],
            },
        ]),
    );
    // 파일명 치환 충돌 상황 — 한 파일에 두 테마가 같이 산다(theme 칸으로 가른다)
    await writeFile(
        join(dir, "theme/raw/rosters/겹침.jsonl"),
        jsonl([
            { v: 1, kind: "snapshot", id: "2024-01-02:오늘의테마", date: "2024-01-02", type: "오늘의테마", src: "awake", theme: "A/B", stocks: ["000001"], unmatched: [], time: "08:00", refs: ["@x#2"] },
            { v: 1, kind: "snapshot", id: "2024-01-01:오늘의테마", date: "2024-01-01", type: "오늘의테마", src: "awake", theme: "A·B", stocks: ["000002"], unmatched: ["옛이름"], time: "08:00", refs: ["@x#3"], headline: "머리" },
            { v: 1, kind: "snapshot", id: "2024-02-01:정배열", date: "2024-02-01", type: "정배열", src: "awake", theme: "A·B", stocks: ["000003"], unmatched: [], time: "07:50", refs: ["@x#4"] },
        ]),
    );
}

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "theme-store-"));
    await seed();
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("loadThemeStore", () => {
    it("등록부를 읽고 같은 말을 흡수한다(띄어쓰기·대소문자 무시)", async () => {
        const s = await loadThemeStore(dir);
        expect(s.keywords).toHaveLength(2);
        expect(s.themeOf("반도체/소부장")).toBe("반도체");
        expect(s.themeOf("ai반도체")).toBe("반도체");
        expect(s.themeOf("중동전쟁")).toBe("중동"); // "중동 전쟁" 의 공백 무시
        expect(s.themeOf("반도체/HBM")).toBe("반도체"); // 같은 말은 테마로 흡수(계층 없음)
        expect(s.themeOf("없는이름")).toBeNull();
    });

    it("moves 를 종목코드로, rosters 를 줄의 theme 칸으로 가른다(날짜 오름차순)", async () => {
        const s = await loadThemeStore(dir);
        const m = s.movesByCode.get("000001");
        expect(m?.name).toBe("가나다");
        expect(m?.issues).toHaveLength(1);
        expect(m?.issues[0]?.themes).toEqual(["반도체/소부장"]);
        expect([...s.rostersByTheme.keys()].sort()).toEqual(["A/B", "A·B"]);
        expect(s.rostersByTheme.get("A·B")?.map((r) => r.date)).toEqual(["2024-01-01", "2024-02-01"]);
    });

    it("깨진 줄은 건너뛰지 않고 throw 한다(재생성으로 고치는 구조)", async () => {
        await writeFile(join(dir, "theme/raw/rosters/깨짐.jsonl"), "{잘못된 json\n");
        await expect(loadThemeStore(dir)).rejects.toThrow(/jsonl 파싱 실패/);
    });
});
