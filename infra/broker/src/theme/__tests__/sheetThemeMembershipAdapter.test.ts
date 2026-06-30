import { describe, it, expect } from "vitest";
import { SheetThemeMembershipAdapter, type ThemeSheetSource } from "../sheetThemeMembershipAdapter.js";

const src = (matrix: string[][]): ThemeSheetSource => ({
    async readMatrix() {
        return matrix;
    },
});
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
