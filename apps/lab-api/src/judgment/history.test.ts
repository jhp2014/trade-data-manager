// 이력 읽기 — 임시 폴더에 이력 · 사전을 두고 이름 맞추기 · 그날 이전만 세기 · 장 마감 정리 · 다시 읽기를 본다.
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryError, HistoryRepo, parseThemeDict } from "./history.js";

const DICT = `# 테마 사전

## 반도체 · IT

| 테마 | 이력 이름 | 상위 |
|---|---|---|
| 반도체 | HBM · 기판 · 반도체소부장 | |
| 유리기판 | 반도체유리기판 | 반도체 |
| MLCC | 적층세라믹콘덴서 | 반도체 |
| 에너지 | 정유 · 가스 | |
| 희토류 | 희귀금속 | 원자재 |
| 원자재 | | |

## 묶지 않는 이름

사전에 없으니 원래 묶이지 않지만, 끝 맞추기로 다른 테마에 새는 이름이라 막아 둔다.

대왕고래 · 동해석유가스
`;

describe("parseThemeDict", () => {
    const d = parseThemeDict(DICT);
    it("같은 이름 · 띄어쓰기 무시 · 상위도", () => {
        expect(d.resolve("HBM")).toEqual(["반도체"]);
        expect(d.resolve("반도체 소부장")).toEqual(["반도체"]);
        expect(d.resolve("유리기판")).toEqual(["유리기판", "반도체"]);
    });
    it("괄호 속 이름 → 괄호 뗀 이름 → 끝이 가장 길게 맞는 이름", () => {
        expect(d.resolve("희귀금속(희토류)")).toEqual(["희토류", "원자재"]);
        expect(d.resolve("MLCC(적층세라믹콘덴서)")).toEqual(["MLCC", "반도체"]);
        expect(d.resolve("따른반도체")).toEqual(["반도체"]);
        expect(d.resolve("이슈부각되며 반도체유리기판")).toEqual(["유리기판", "반도체"]);
    });
    it("사전에 없는 이름 · 묶지 않는 이름은 []", () => {
        expect(d.resolve("인맥(이재명)")).toEqual([]);
        expect(d.resolve("대왕고래")).toEqual([]);
        expect(d.resolve("동해석유가스")).toEqual([]); // 끝 맞추기로 에너지(가스)에 새지 않는다
    });
});

let root: string;
let repo: HistoryRepo;
const cafe = (date: string, title: string, pct: number) => ({ src: "cafe", date, time: "17:00", title, ref: "주도주시황 1", pct, after: null });
const issue = (date: string, themes: string[], extra: object = {}) => ({
    v: 1, kind: "issue", id: date, date, themes, issue: `${date} 이유`, high: null,
    evidence: [cafe(date, `1. ${themes.join("/")} 관련주 상승`, 10)], by: "claude", note: "", ...extra,
});
const file = (code: string, name: string, rows: object[]) =>
    writeFile(join(root, "이력", `${code}.jsonl`), [{ v: 1, kind: "stock", id: "stock", code, name, from: "2025-01-01", to: code === "000002" ? "2025-06-30" : "2025-05-31" }, ...rows].map((r) => JSON.stringify(r)).join("\n") + "\n");

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "judgment-history-"));
    await mkdir(join(root, "이력"), { recursive: true });
    await mkdir(join(root, "관점"), { recursive: true });
    await writeFile(join(root, "관점", "테마 사전.md"), DICT);
    await file("000001", "알파", [
        issue("2025-01-02", ["HBM"]),
        issue("2025-03-04", ["반도체 유리기판"]),
        issue("2025-03-05", ["반도체"]),
        issue("2025-04-01", ["인맥(이재명)"]),
        issue("2025-05-01", ["정유"]),
    ]);
    await file("000002", "베타", [issue("2025-05-01", ["정유"]), { bad: "줄" }]);
    repo = new HistoryRepo(root);
});
afterEach(async () => {
    repo.close();
    await rm(root, { recursive: true, force: true });
});

describe("themesAsOf", () => {
    it("그날 **이전** 줄만 — 많이 · 최근 순, 사전에 없는 이름은 묶지 않는다", async () => {
        expect((await repo.themesAsOf("2025-05-01")).stocks).toEqual({ "000001": ["반도체", "유리기판"] });
        expect(await repo.themesAsOf("2025-05-02")).toEqual({
            stocks: { "000001": ["반도체", "에너지", "유리기판"], "000002": ["에너지"] },
            coverage: { from: "2025-01-01", to: "2025-06-30" }, // 종목 줄 from · to 를 모은 것
        });
    });
    it("날짜 형식이 아니면 400", async () => {
        await expect(repo.themesAsOf("2025-5-1")).rejects.toMatchObject({ status: 400 });
    });
});

describe("stock", () => {
    it("기준일 이전 줄(최근 먼저) · 테마별 셈과 세부 이름 · 기준일의 장 마감 정리", async () => {
        const h = await repo.stock("000001", "2025-05-01");
        expect(h.name).toBe("알파");
        expect(h.lines.map((l) => l.date)).toEqual(["2025-04-01", "2025-03-05", "2025-03-04", "2025-01-02"]);
        expect(h.lines[0]).toMatchObject({ details: ["인맥(이재명)"], themes: [], pct: 10, sources: ["cafe"] });
        expect(h.themes[0]).toEqual({ theme: "반도체", n: 3, first: "2025-01-02", last: "2025-03-05", details: expect.arrayContaining(["HBM", "반도체 유리기판", "반도체"]) });
        expect(h.closing).toMatchObject({ date: "2025-05-01", details: ["정유"], themes: ["에너지"], reasons: ["1. 정유 관련주 상승"] });
    });
    it("기준일에 카페 근거가 없으면 장 마감 정리는 null", async () => {
        await file("000003", "감마", [issue("2025-05-01", ["HBM"], { evidence: [{ src: "telegram", date: "2025-05-01", title: "x" }] })]);
        repo.close();
        expect((await repo.stock("000003", "2025-05-01")).closing).toBeNull();
    });
    it("이력 없음 404 · 코드 · 날짜 형식 400", async () => {
        await expect(repo.stock("999999", "2025-05-01")).rejects.toMatchObject({ status: 404 });
        await expect(repo.stock("12", "2025-05-01")).rejects.toBeInstanceOf(HistoryError);
        await expect(repo.stock("000001", "x")).rejects.toMatchObject({ status: 400 });
    });
});

it("이력 · 사전 파일이 바뀌면 다시 읽는다", async () => {
    expect((await repo.themesAsOf("2025-05-02")).stocks).toHaveProperty("000002", ["에너지"]);
    await writeFile(join(root, "관점", "테마 사전.md"), DICT.replace("| 에너지 | 정유 · 가스 | |", "| 정유 | | |"));
    await expect.poll(async () => (await repo.themesAsOf("2025-05-02")).stocks["000002"], { timeout: 3000 }).toEqual(["정유"]);
    await file("000004", "델타", [issue("2025-01-01", ["HBM"])]);
    await expect.poll(async () => (await repo.themesAsOf("2025-05-02")).stocks["000004"], { timeout: 3000 }).toEqual(["반도체"]);
});

it("이력 폴더가 아직 없으면 빈 소속을 캐시하지 않는다 — 나중에 생기면 읽는다", async () => {
    const r2 = await mkdtemp(join(tmpdir(), "judgment-history-empty-"));
    await mkdir(join(r2, "관점"), { recursive: true });
    await writeFile(join(r2, "관점", "테마 사전.md"), DICT);
    const repo2 = new HistoryRepo(r2);
    try {
        expect(await repo2.themesAsOf("2025-05-02")).toEqual({ stocks: {}, coverage: null });
        await mkdir(join(r2, "이력"));
        await writeFile(join(r2, "이력", "000009.jsonl"), JSON.stringify(issue("2025-01-01", ["HBM"])) + "\n");
        expect((await repo2.themesAsOf("2025-05-02")).stocks).toEqual({ "000009": ["반도체"] });
    } finally {
        repo2.close();
        await rm(r2, { recursive: true, force: true });
    }
});
