import { describe, it, expect, vi, afterEach } from "vitest";
import { localReadDualWrite } from "../curation/mirrorWrite.js";

/** 저장소 흉내 — 읽기 하나, 쓰기 하나. 어느 쪽 인스턴스가 불렸는지 기록한다. */
const repo = (tag: string, calls: string[], failOnWrite = false) => ({
    list: (): Promise<string> => {
        calls.push(`${tag}.list`);
        return Promise.resolve(tag);
    },
    save: (v: string): Promise<string> => {
        calls.push(`${tag}.save(${v})`);
        if (failOnWrite) return Promise.reject(new Error("boom"));
        return Promise.resolve(`${tag}:${v}`);
    },
});

describe("localReadDualWrite — 읽기는 로컬, 쓰기는 원격 먼저 + 로컬 재생", () => {
    afterEach(() => vi.restoreAllMocks());

    it("읽기는 로컬만 — 여기가 egress 를 없애는 지점이다", async () => {
        const calls: string[] = [];
        const r = localReadDualWrite(repo("local", calls), repo("remote", calls), ["save"], "t");
        expect(await r.list()).toBe("local");
        expect(calls).toEqual(["local.list"]);
    });

    it("쓰기는 **원격 먼저** 그다음 로컬 — 순서가 뒤집히면 전체교체 때 편집이 사라진다", async () => {
        const calls: string[] = [];
        const r = localReadDualWrite(repo("local", calls), repo("remote", calls), ["save"], "t");
        expect(await r.save("x")).toBe("remote:x"); // 권위 있는 쪽의 결과를 돌려준다
        expect(calls).toEqual(["remote.save(x)", "local.save(x)"]);
    });

    it("로컬 재생이 실패해도 요청은 성공 — 원격은 이미 들어갔고 다음 동기화가 치유한다", async () => {
        const calls: string[] = [];
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = localReadDualWrite(repo("local", calls, true), repo("remote", calls), ["save"], "t");
        await expect(r.save("x")).resolves.toBe("remote:x");
        expect(err).toHaveBeenCalledOnce(); // 조용히 넘어가지는 않는다
    });

    it("원격이 실패하면 그대로 올린다 — 로컬만 앞서가면 유령 데이터가 된다", async () => {
        const calls: string[] = [];
        const r = localReadDualWrite(repo("local", calls), repo("remote", calls, true), ["save"], "t");
        await expect(r.save("x")).rejects.toThrow("boom");
        expect(calls).toEqual(["remote.save(x)"]); // 로컬은 손도 안 댔다
    });

    it("writes 에 없는 메서드는 쓰기로 안 본다 — 목록이 유일한 출처다", async () => {
        const calls: string[] = [];
        const r = localReadDualWrite(repo("local", calls), repo("remote", calls), [], "t");
        await r.save("x");
        expect(calls).toEqual(["local.save(x)"]);
    });
});
