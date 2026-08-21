import { describe, expect, it } from "vitest";
import type { DailyComment } from "@trade-data-manager/market";
import { DailyComments } from "../dailyComments.js";

// 메모리 페이크 — (date, code) 자연키 맵. 컨트롤러 안에 있던 규칙이 이제 여기서 검증된다.
// 검증 읽기는 rows 직접(페이크 내부 상태) — 서비스 읽기는 listAll 하나뿐이다(단건 읽기는 클라 복제본 셀렉터로 은퇴).
function fakeRepo(seed: DailyComment[] = []) {
    const rows = new Map(seed.map((c) => [`${c.date}|${c.stockCode}`, c]));
    return {
        rows,
        getByDate: async (date: string) => [...rows.values()].filter((c) => c.date === date),
        listAll: async () => [...rows.values()],
        upsert: async (c: DailyComment) => void rows.set(`${c.date}|${c.stockCode}`, c),
        remove: async (date: string, stockCode: string) => void rows.delete(`${date}|${stockCode}`),
    };
}

const D = "2026-07-01";
const CODE = "005930";
const key = `${D}|${CODE}`;

describe("DailyComments", () => {
    it("빈 코멘트 저장 = 삭제(도메인 규약)", async () => {
        const repo = fakeRepo([{ date: D, stockCode: CODE, comment: "이전 메모", author: "me" }]);
        const svc = new DailyComments(repo, "me");

        expect(await svc.save(D, CODE, "")).toBeNull();
        expect(repo.rows.get(key)).toBeUndefined();
    });

    it("공백만 있는 코멘트도 삭제로 본다", async () => {
        const repo = fakeRepo([{ date: D, stockCode: CODE, comment: "이전 메모", author: "me" }]);
        const svc = new DailyComments(repo, "me");

        await svc.save(D, CODE, "   \n  ");
        expect(repo.rows.get(key)).toBeUndefined();
    });

    it("저장은 앞뒤 공백을 떼고 author 를 서버 값으로 박는다(클라가 못 정한다)", async () => {
        const repo = fakeRepo();
        const svc = new DailyComments(repo, "서버계정");

        const saved = await svc.save(D, CODE, "  갭 상승 관찰  ");
        expect(saved).toEqual({ date: D, stockCode: CODE, comment: "갭 상승 관찰", author: "서버계정" });
        expect(await svc.listAll()).toEqual([{ date: D, stockCode: CODE, comment: "갭 상승 관찰", author: "서버계정" }]);
    });

    it("같은 (날짜,종목) 재저장은 덮어쓴다(종목당 당일 1개)", async () => {
        const repo = fakeRepo();
        const svc = new DailyComments(repo, "me");

        await svc.save(D, CODE, "처음");
        await svc.save(D, CODE, "고침");
        expect(repo.rows.size).toBe(1);
        expect(repo.rows.get(key)).toMatchObject({ comment: "고침" });
    });
});
