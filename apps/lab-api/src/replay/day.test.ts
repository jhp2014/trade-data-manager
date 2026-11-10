// 장부 정규화 — 이름 바꾸기(이름 · 이름표 통째) · 같은 이름표 합치기 · 보이기 시작하는 때(from) · 옛 꼴 basis · mtime 캐시.
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeReplayDayReader, makeTagger, normalizeRow } from "./day.js";

describe("makeTagger", () => {
    it("「/」 없는 from = 상위·세부 이름 바꾸기(사슬) · 「/」 있는 from = 이름표 통째(세부 지우기)", () => {
        const tag = makeTagger([
            { from: "A", to: "B" },
            { from: "B", to: "C" },
            { from: "반도체/세액공제", to: "반도체" },
            { from: "X", to: "X" }, // 고리여도 멈춘다
        ]);
        expect(tag({ theme: "A" })).toBe("C");
        expect(tag({ theme: "게임", sub: "A" })).toBe("게임/C");
        expect(tag({ theme: "반도체", sub: "세액공제" })).toBe("반도체");
        expect(tag({ theme: "X" })).toBe("X");
    });
});

describe("normalizeRow", () => {
    const none = makeTagger([]);
    it("장 마감 ∪ 장 전, 장 마감 순서 먼저 · 근거 합집합 · from 규칙", () => {
        const r = normalizeRow(
            {
                code: "000001",
                name: "가",
                pre: [{ theme: "바이오", basis: ["carry"] }, { theme: "옛것", basis: ["base"] }],
                close: [
                    { theme: "바이오", basis: ["issue", "carry"], since: "10:00" }, // 장 전에 있던 이름표 → open
                    { theme: "게임", sub: "판호", basis: ["issue", "base"], since: "13:37" }, // 장중 새 이름표 → 그 시각
                    { theme: "데이터센터", basis: ["ride"] }, // 편승 → open
                    { theme: "은행", basis: ["issue"] }, // since 없음 → open
                ],
                why: "이유",
            },
            none,
        );
        expect(r).toEqual({
            code: "000001",
            name: "가",
            why: "이유",
            labels: [
                { theme: "바이오", basis: ["issue", "carry"], from: "open" },
                { theme: "게임", sub: "판호", basis: ["issue", "base"], from: "13:37" },
                { theme: "데이터센터", basis: ["ride"], from: "open" },
                { theme: "은행", basis: ["issue"], from: "open" },
                { theme: "옛것", basis: ["base"], from: "open" },
            ],
        });
    });
    it("옛 꼴 basis 문자열도 받는다 · 이름 바꾸기로 같은 이름표가 된 항목은 하나로(근거 합집합, 개장부터인 항목이 있으면 open)", () => {
        const tag = makeTagger([{ from: "반도체/세액공제", to: "반도체" }]);
        const r = normalizeRow(
            {
                code: "000002",
                close: [
                    { theme: "반도체", sub: "세액공제", basis: "issue", since: "09:30" },
                    { theme: "반도체", basis: ["base"] },
                ],
            },
            tag,
        );
        expect(r).toEqual({ code: "000002", name: "", why: "", labels: [{ theme: "반도체", basis: ["issue", "base"], from: "open" }] });
    });
    it("합친 항목이 모두 장중 당일 이슈면 가장 이른 since · 당일 이슈 + 편승은 open(편승은 처음부터) · 테마 없음은 내보내지 않는다", () => {
        const tag = makeTagger([{ from: "x", to: "z" }, { from: "y", to: "z" }]);
        const r = normalizeRow(
            {
                code: "000003",
                pre: [{ theme: "테마 없음", basis: ["none"] }],
                close: [
                    { theme: "A", sub: "x", basis: ["issue"], since: "13:00" },
                    { theme: "A", sub: "y", basis: ["issue"], since: "10:00" },
                    { theme: "B", basis: ["issue", "ride"], since: "11:00" },
                    { theme: "테마 없음", basis: ["none"] },
                ],
            },
            tag,
        );
        expect(r.labels).toEqual([
            { theme: "A", sub: "z", basis: ["issue"], from: "10:00" },
            { theme: "B", basis: ["issue", "ride"], from: "open" },
        ]);
    });
});

describe("makeReplayDayReader", () => {
    let dir: string;
    const ledger = () => join(dir, "theme/replay/curated/2023-01-05.jsonl");
    const renames = () => join(dir, "theme/replay/renames.jsonl");
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "replay-day-"));
        await mkdir(join(dir, "theme/replay/curated"), { recursive: true });
    });
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it("장부 없는 날 = null · 이름 바꾸기 파일이 없어도 읽는다", async () => {
        const read = makeReplayDayReader(dir);
        expect(await read("2023-01-05")).toBeNull();
        await writeFile(ledger(), JSON.stringify({ code: "000001", name: "가", close: [{ theme: "건설", basis: ["base"] }], why: "w" }) + "\n");
        expect(await read("2023-01-05")).toEqual({ date: "2023-01-05", rows: [{ code: "000001", name: "가", labels: [{ theme: "건설", basis: ["base"], from: "open" }], why: "w" }] });
    });
    it("mtime 이 같으면 지난 결과 · 장부나 이름 바꾸기가 바뀌면 다시 읽는다", async () => {
        const read = makeReplayDayReader(dir);
        await writeFile(ledger(), JSON.stringify({ code: "000001", close: [{ theme: "건설", sub: "두바이", basis: ["base"] }] }) + "\n");
        const first = await read("2023-01-05");
        expect(await read("2023-01-05")).toBe(first); // 같은 객체 — 캐시
        await writeFile(renames(), JSON.stringify({ from: "두바이", to: "중동" }) + "\n");
        expect((await read("2023-01-05"))!.rows[0].labels[0].sub).toBe("중동");
        await writeFile(ledger(), JSON.stringify({ code: "000001", close: [{ theme: "조선", basis: ["base"] }] }) + "\n");
        const later = new Date(Date.now() + 5_000);
        await utimes(ledger(), later, later); // 같은 ms 안 쓰기에도 mtime 이 갈리게
        expect((await read("2023-01-05"))!.rows[0].labels[0].theme).toBe("조선");
    });
    it("깨진 줄 · 꼴 아닌 줄은 throw(건너뛰지 않는다)", async () => {
        const read = makeReplayDayReader(dir);
        await writeFile(ledger(), "{깨짐\n");
        await expect(read("2023-01-05")).rejects.toThrow("jsonl 파싱 실패");
        await writeFile(ledger(), JSON.stringify({ name: "코드 없음" }) + "\n");
        const later = new Date(Date.now() + 10_000);
        await utimes(ledger(), later, later);
        await expect(read("2023-01-05")).rejects.toThrow("장부 줄 꼴이 아님");
    });
});
