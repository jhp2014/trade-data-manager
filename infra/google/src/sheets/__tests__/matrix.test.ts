import { describe, it, expect } from "vitest";
import { headerIndexMap, matrixToObjects, objectsToMatrix } from "../matrix.js";

const aliases = {
    theme: ["테마", "theme"],
    code: ["종목코드", "코드", "code"],
    name: ["종목명", "name"],
};

describe("headerIndexMap", () => {
    it("헤더 이름으로 컬럼을 찾고 순서에 무관하다", () => {
        expect(headerIndexMap(["종목명", "테마", "코드"], aliases)).toEqual({
            name: 0,
            theme: 1,
            code: 2,
        });
    });

    it("매칭 헤더 없는 키는 빠진다", () => {
        expect(headerIndexMap(["테마"], aliases)).toEqual({ theme: 0 });
    });

    it("trim/대소문자 무시", () => {
        expect(headerIndexMap([" THEME ", "Code"], aliases)).toEqual({ theme: 0, code: 1 });
    });
});

describe("matrixToObjects", () => {
    it("데이터 행 하나 → 객체 하나(키는 alias 키)", () => {
        const rows = [
            ["테마", "종목코드", "종목명"],
            ["AI", "000660", "SK하이닉스"],
            ["2차전지", "373220", "LG엔솔"],
        ];
        expect(matrixToObjects(rows, aliases)).toEqual([
            { theme: "AI", code: "000660", name: "SK하이닉스" },
            { theme: "2차전지", code: "373220", name: "LG엔솔" },
        ]);
    });

    it("빈 행은 건너뛰고 셀은 trim 한다", () => {
        const rows = [
            ["테마", "코드"],
            ["", ""],
            [" AI ", " 005930 "],
        ];
        expect(matrixToObjects(rows, aliases)).toEqual([{ theme: "AI", code: "005930" }]);
    });

    it("헤더만 있거나 비면 []", () => {
        expect(matrixToObjects([["테마"]], aliases)).toEqual([]);
        expect(matrixToObjects([], aliases)).toEqual([]);
    });
});

describe("objectsToMatrix", () => {
    it("columns 순서대로 헤더행 + 데이터행", () => {
        const objs = [{ theme: "AI", code: "000660" }];
        expect(
            objectsToMatrix(objs, [
                { key: "theme", header: "테마" },
                { key: "code", header: "종목코드" },
            ]),
        ).toEqual([
            ["테마", "종목코드"],
            ["AI", "000660"],
        ]);
    });

    it("없는 키는 빈 문자열", () => {
        expect(
            objectsToMatrix([{ theme: "AI" }], [
                { key: "theme", header: "테마" },
                { key: "code", header: "코드" },
            ]),
        ).toEqual([
            ["테마", "코드"],
            ["AI", ""],
        ]);
    });
});
