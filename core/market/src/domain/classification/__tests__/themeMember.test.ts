import { describe, it, expect } from "vitest";
import { buildThemeIndex, type ThemeMember } from "../themeMember.js";

const tm = (theme: string, code: string, over: Partial<ThemeMember> = {}): ThemeMember => ({
    theme,
    code,
    ...over,
});

describe("buildThemeIndex", () => {
    it("양방향 룩업 — themesOf / codesOf 둘 다 채워진다", () => {
        const idx = buildThemeIndex([
            tm("HBM", "000660"),
            tm("HBM", "005930"),
            tm("초전도체", "000660"),
        ]);
        expect(idx.themesOf("000660")).toEqual(["HBM", "초전도체"]);
        expect(idx.codesOf("HBM")).toEqual(["000660", "005930"]);
    });

    it("다중테마 종목 — themesOf 가 여러 테마(후보 자동 노출)", () => {
        const idx = buildThemeIndex([tm("원전", "111111"), tm("초전도체", "111111")]);
        expect(idx.themesOf("111111")).toEqual(["원전", "초전도체"]);
    });

    it("미지의 code/theme → 빈 배열(='미분류' 후보)", () => {
        const idx = buildThemeIndex([tm("HBM", "000660")]);
        expect(idx.themesOf("999999")).toEqual([]);
        expect(idx.codesOf("없는테마")).toEqual([]);
    });

    it("중복 (theme,code) 행은 dedup", () => {
        const idx = buildThemeIndex([tm("HBM", "000660"), tm("HBM", "000660")]);
        expect(idx.themesOf("000660")).toEqual(["HBM"]);
        expect(idx.codesOf("HBM")).toEqual(["000660"]);
    });

    it("allThemes — 등장 테마 distinct", () => {
        const idx = buildThemeIndex([tm("HBM", "a"), tm("원전", "b"), tm("HBM", "c")]);
        expect(idx.allThemes()).toEqual(["HBM", "원전"]);
    });

    it("룩업 결과 변형이 내부상태를 오염시키지 않는다", () => {
        const idx = buildThemeIndex([tm("HBM", "000660")]);
        idx.themesOf("000660").push("오염");
        expect(idx.themesOf("000660")).toEqual(["HBM"]);
    });

    it("빈 입력 → 빈 인덱스", () => {
        const idx = buildThemeIndex([]);
        expect(idx.allThemes()).toEqual([]);
        expect(idx.themesOf("x")).toEqual([]);
    });
});
