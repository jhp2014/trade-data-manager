import { describe, it, expect } from "vitest";
import { toPlain } from "../serialize.js";

// big-integer 인스턴스 흉내(GramJS long) — toJSNumber + value.
function fakeBigInt(s: string) {
    return { value: s, toJSNumber: () => Number(s), toString: () => s };
}

describe("toPlain", () => {
    it("originalArgs·_내부필드·함수를 걷어내고 className 은 남긴다", () => {
        const obj = {
            className: "Message",
            id: 7,
            originalArgs: { id: 7, message: "dup" },
            _client: { huge: true },
            message: "hi",
            fn: () => 1,
        };
        expect(toPlain(obj)).toEqual({ className: "Message", id: 7, message: "hi" });
    });

    it("BigInteger → 10진 문자열, Buffer → 길이, Date → ISO, 배열은 원소별", () => {
        const out = toPlain({
            groupedId: fakeBigInt("13838493720000000001"),
            fileReference: Buffer.from([1, 2, 3]),
            when: new Date("2026-10-13T00:00:00Z"),
            entities: [{ className: "MessageEntityUrl", offset: 0, length: 5, _x: 1 }],
        }) as Record<string, unknown>;
        expect(out.groupedId).toBe("13838493720000000001");
        expect(out.fileReference).toEqual({ bytes: 3 });
        expect(out.when).toBe("2026-10-13T00:00:00.000Z");
        expect(out.entities).toEqual([{ className: "MessageEntityUrl", offset: 0, length: 5 }]);
    });

    it("스칼라·null 은 그대로", () => {
        expect(toPlain(null)).toBeNull();
        expect(toPlain(3)).toBe(3);
        expect(toPlain("s")).toBe("s");
        expect(toPlain(10n)).toBe("10");
    });
});
