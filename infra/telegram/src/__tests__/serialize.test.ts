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

    it("깊이 상한을 넘는 가지는 표식으로 자르고(원객체 반환 금지), 가변 수치 키는 뺀다", () => {
        let deep: Record<string, unknown> = { leaf: 1 };
        for (let i = 0; i < 20; i++) deep = { child: deep };
        const s = JSON.stringify(toPlain(deep)); // 순환·bigint 없이 직렬화돼야 한다
        expect(s).toContain('"[depth]"');
        expect(s).not.toContain("leaf");
        expect(toPlain({ id: 1, views: 10, forwards: 2, reactions: { x: 1 }, replies: { replies: 3 } })).toEqual({ id: 1 });
    });

    it("스칼라·null 은 그대로", () => {
        expect(toPlain(null)).toBeNull();
        expect(toPlain(3)).toBe(3);
        expect(toPlain("s")).toBe("s");
        expect(toPlain(10n)).toBe("10");
    });
});
