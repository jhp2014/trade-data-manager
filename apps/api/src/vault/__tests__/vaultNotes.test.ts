import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { nameFromFile, normalizeTime, parseNote } from "../noteFrontmatter.js";
import { NOTES_SUBDIR, VaultNotes } from "../vaultNotes.js";

/** BOM — 코드값으로 만든다(보이지 않는 문자를 소스에 박지 않게). */
const BOM = String.fromCharCode(0xfeff);
const FILE = "26년 07월/26.07.31 삼성전기 0905.md";
const note = (fm: string, body = ""): string => `---\n${fm}\n---\n${body}`;
const BASE = '종목: 삼성전기\n종목코드: "009150"\n날짜: 2026-07-31\n시간: "09:05"';

describe("parseNote", () => {
    it("기본 — 시간은 HH:MM:SS 로, 빈 칸은 null, 메모 유무", () => {
        const r = parseNote(note(`${BASE}\n상태: 기록\n감:\n후보:`, "**가설**\n\n- 눌림"), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect(r.note).toMatchObject({ code: "009150", name: "삼성전기", date: "2026-07-31", time: "09:05:00", state: "기록", gam: null, candidate: null, hasMemo: true });
        expect(r.note.memoHead).toBe("**가설**\n\n- 눌림");
        expect(r.warns).toEqual([]);
    });

    it("옛 노트 — 상태·감·후보 키가 아예 없으면 null", () => {
        const r = parseNote(note(BASE), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect([r.note.state, r.note.gam, r.note.candidate, r.note.hasMemo]).toEqual([null, null, null, false]);
        expect(r.note.memoHead).toBeUndefined();
    });

    it("BOM · CRLF 를 받는다", () => {
        const r = parseNote(`${BOM}${note(`${BASE}\n상태: 아님`, "메모")}`.replace(/\n/g, "\r\n"), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect([r.note.time, r.note.state, r.note.memoHead]).toEqual(["09:05:00", "아님", "메모"]);
    });

    it("첫 콜론에서만 자른다 · 따옴표 없는 시간 · 주석 떼기 · 따옴표 안 # 은 값", () => {
        const r = parseNote(note('종목코드: 009150\n날짜: 2026-07-31\n시간: 9:05\n상태: 기록     # 기록 | 아님\n종목: "A #1"'), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect([r.note.time, r.note.state, r.note.name]).toEqual(["09:05:00", "기록", "A #1"]);
    });

    it("NFD 한글 키·값도 읽는다", () => {
        const r = parseNote(note(`${BASE}\n${"상태".normalize("NFD")}: ${"기록".normalize("NFD")}\n감: ${"할 만함".normalize("NFD")}`), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect([r.note.state, r.note.gam]).toEqual(["기록", "할 만함"]);
        expect(r.warns).toEqual([]);
    });

    it("따옴표 값 뒤 꼬리 주석은 버린다", () => {
        const r = parseNote(note('종목코드: "009150"  # 삼성전기\n날짜: 2026-07-31\n시간: "09:05" # 기준 양봉'), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect([r.note.code, r.note.time]).toEqual(["009150", "09:05:00"]);
    });

    it("모르는 열거 값·목록 모양은 칸만 비우고 경고", () => {
        const r = parseNote(note(`${BASE}\n상태: 진입\n감:\n  - 애매`), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect([r.note.state, r.note.gam]).toEqual([null, null]);
        expect(r.warns).toHaveLength(2);
    });

    it("숫자로 바뀐 종목코드는 6자리로 채워 살린다(경고)", () => {
        const r = parseNote(note('종목코드: 9150\n날짜: 2026-07-31\n시간: "09:05"'), FILE);
        if (!("note" in r)) throw new Error(r.skip);
        expect(r.note.code).toBe("009150");
        expect(r.warns).toHaveLength(1);
    });

    it("필수 칸이 깨지면 노트째 버리고 이유를 남긴다", () => {
        expect(parseNote("메모만", FILE)).toEqual({ skip: "앞머리 없음" });
        expect(parseNote(`---\n${BASE}\n메모`, FILE)).toEqual({ skip: "앞머리 닫힘 없음" });
        expect("skip" in parseNote(note('종목코드: "00915X0"\n날짜: 2026-07-31\n시간: "09:05"'), FILE)).toBe(true);
        expect("skip" in parseNote(note('종목코드: "009150"\n날짜: 2026-02-30\n시간: "09:05"'), FILE)).toBe(true);
        expect("skip" in parseNote(note('종목코드: "009150"\n날짜: 2026-07-31\n시간: "24:00"'), FILE)).toBe(true);
    });

    it("종목 칸이 없으면 파일명의 종목명(새 이름 = 날짜 종목명 시간, 옛 이름도 읽는다)", () => {
        expect(nameFromFile("26년 07월/26.07.31 LS ELECTRIC 0905.md")).toBe("LS ELECTRIC");
        expect(nameFromFile("26.07.31 0905 LS ELECTRIC.md")).toBe("LS ELECTRIC");
        expect(nameFromFile("메모.md")).toBeNull();
        const r = parseNote(note('종목코드: "009150"\n날짜: 2026-07-31\n시간: "09:05"'), "26.07.31 삼성전기 0905.md");
        if (!("note" in r)) throw new Error(r.skip);
        expect(r.note.name).toBe("삼성전기");
    });

    it("normalizeTime", () => {
        expect(normalizeTime("08:02")).toBe("08:02:00");
        expect(normalizeTime("08:02:30")).toBe("08:02:30");
        expect(normalizeTime("8:60")).toBeNull();
        expect(normalizeTime("0802")).toBeNull();
    });
});

describe("VaultNotes", () => {
    let tmp: string;
    beforeAll(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), "vault-"));
        const dir = path.join(tmp, NOTES_SUBDIR, "26년 07월");
        await fs.mkdir(dir, { recursive: true });
        await fs.mkdir(path.join(tmp, NOTES_SUBDIR, ".obsidian"), { recursive: true });
        await fs.writeFile(path.join(dir, "26.07.31 삼성전기 0911.md"), note('종목코드: "009150"\n날짜: 2026-07-31\n시간: "09:11"'));
        await fs.writeFile(path.join(dir, "26.07.31 삼성전기 0905.md"), `${BOM}${note(BASE)}`.replace(/\n/g, "\r\n"));
        await fs.writeFile(path.join(dir, "26.07.30 깨짐 1000.md"), "앞머리 없음");
        await fs.writeFile(path.join(dir, "메모.txt"), "무시");
        await fs.writeFile(path.join(tmp, NOTES_SUBDIR, ".obsidian", "x.md"), note(BASE));
    });
    afterAll(async () => {
        await fs.rm(tmp, { recursive: true, force: true });
    });

    it("미설정 = unset", async () => {
        expect(await new VaultNotes(null).list()).toEqual({ vault: "unset" });
    });

    it("경로·노트 폴더가 없으면 missing(빈 목록으로 위장 안 함)", async () => {
        const r1 = await new VaultNotes(path.join(tmp, "없음")).list();
        expect(r1.vault).toBe("missing");
        const empty = await fs.mkdtemp(path.join(os.tmpdir(), "vault-empty-"));
        const r2 = await new VaultNotes(empty).list();
        expect(r2).toMatchObject({ vault: "missing" });
        await fs.rm(empty, { recursive: true, force: true });
    });

    it("ok — .md 만 · 점 폴더 무시 · 정렬 · 버린 노트는 issues", async () => {
        const r = await new VaultNotes(tmp).list();
        if (r.vault !== "ok") throw new Error(r.vault);
        expect(r.notes.map((n) => `${n.date} ${n.time}`)).toEqual(["2026-07-31 09:05:00", "2026-07-31 09:11:00"]);
        expect(r.notes[0]!.id).toBe("26년 07월/26.07.31 삼성전기 0905.md");
        expect(r.issues).toEqual([{ file: "26년 07월/26.07.30 깨짐 1000.md", why: "앞머리 없음", skipped: true }]);
    });
});
