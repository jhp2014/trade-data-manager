import { describe, it, expect } from "vitest";
import { SheetThemeMembershipAdapter, type ThemeSheetSource } from "../sheetThemeMembershipAdapter.js";

type Appended = Parameters<ThemeSheetSource["appendRows"]>[0];
/** 매트릭스를 읽어주고 append 호출을 캡처하는 스텁. */
function src(matrix: string[][]): ThemeSheetSource & { appends: Appended[] } {
    const appends: Appended[] = [];
    return {
        appends,
        async readMatrix() {
            return matrix;
        },
        async appendRows(input) {
            appends.push(input);
            return { wroteHeaders: false };
        },
    };
}
const cfg = { spreadsheetId: "sid", tab: "종목분류" };
const load = (matrix: string[][]) => new SheetThemeMembershipAdapter(src(matrix), cfg).load();

describe("SheetThemeMembershipAdapter", () => {
    it("헤더별칭 파싱 + toCanonical(A접두·_접미·앞0복원) + 선택필드", async () => {
        const m = await load([
            ["테마", "종목코드", "종목명", "편입이슈", "날짜"],
            ["HBM", "A000660", "SK하이닉스", "수급", "2026-06-01"],
            ["반도체", "5930", "삼성전자", "", ""],
            ["원전", "005930_AL", "", "", ""],
        ]);
        expect(m).toEqual([
            { theme: "HBM", code: "000660", name: "SK하이닉스", issue: "수급", date: "2026-06-01" },
            { theme: "반도체", code: "005930", name: "삼성전자" },
            { theme: "원전", code: "005930" },
        ]);
    });

    it("KRX 영숫자 코드(예 0007C0)는 padStart 없이 보존·대문자화", async () => {
        // KRX 숫자고갈 영숫자 코드 — 순수숫자가 아니라 6자리 pad 대상이 아님(그대로 둬야 join 일치).
        const m = await load([
            ["테마", "종목코드"],
            ["로봇", "0007c0"],
            ["바이오", "0009K0"],
        ]);
        expect(m).toEqual([
            { theme: "로봇", code: "0007C0" },
            { theme: "바이오", code: "0009K0" },
        ]);
    });

    it("컬럼 순서 무관 + 별칭 변형(코드/theme)", async () => {
        const m = await load([
            ["코드", "theme"],
            ["000660", "HBM"],
        ]);
        expect(m).toEqual([{ theme: "HBM", code: "000660" }]);
    });

    it("theme·code 중 하나라도 비면 행 skip", async () => {
        const m = await load([
            ["테마", "종목코드"],
            ["", "000660"], // theme 없음
            ["HBM", ""], // code 없음
            ["HBM", "000660"],
        ]);
        expect(m).toEqual([{ theme: "HBM", code: "000660" }]);
    });

    it("헤더만 / 빈 매트릭스 → 빈 배열", async () => {
        expect(await load([["테마", "종목코드"]])).toEqual([]);
        expect(await load([])).toEqual([]);
    });
});

describe("SheetThemeMembershipAdapter.addMember", () => {
    it("기존 헤더 순서에 맞춰 1행 append(컬럼순서 무관) + code toCanonical", async () => {
        const s = src([["종목코드", "테마", "날짜", "종목명"]]); // 헤더 순서가 뒤섞인 시트
        await new SheetThemeMembershipAdapter(s, cfg).addMember({ theme: "로봇", code: "660", name: "삼성", date: "2026-07-07" });
        expect(s.appends).toHaveLength(1);
        expect(s.appends[0]).toMatchObject({ spreadsheetId: "sid", tab: "종목분류" });
        // 헤더 순서(코드·테마·날짜·명)대로 값이 배치돼야 함. code 는 6자리 pad.
        expect(s.appends[0].rows).toEqual([["000660", "로봇", "2026-07-07", "삼성"]]);
    });

    it("빈 탭이면 DEFAULT_HEADER 로 초기화 + 미지정 컬럼은 공백", async () => {
        const s = src([]); // 빈 탭
        await new SheetThemeMembershipAdapter(s, cfg).addMember({ theme: "HBM", code: "A000660" });
        // 기본 헤더 테마|종목코드|종목명|편입이슈|날짜 순, name/issue/date 없음 → 공백
        expect(s.appends[0].headers).toEqual(["테마", "종목코드", "종목명", "편입이슈", "날짜"]);
        expect(s.appends[0].rows).toEqual([["HBM", "000660", "", "", ""]]);
    });

    it("theme·code 비면 append 안 하고 throw", async () => {
        const s = src([["테마", "종목코드"]]);
        await expect(new SheetThemeMembershipAdapter(s, cfg).addMember({ theme: "  ", code: "660" })).rejects.toThrow();
        expect(s.appends).toHaveLength(0);
    });
});
