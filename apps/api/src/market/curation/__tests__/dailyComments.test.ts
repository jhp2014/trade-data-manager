import { describe, expect, it } from "vitest";
import type { DailyComment } from "@trade-data-manager/market";
import { DailyComments } from "../dailyComments.js";

// 메모리 페이크 — (date, code) 자연키 맵. 컨트롤러 안에 있던 규칙이 이제 여기서 검증된다.
function fakeRepo(seed: DailyComment[] = []) {
    const rows = new Map(seed.map((c) => [`${c.date}|${c.stockCode}`, c]));
    return {
        rows,
        getByDate: async (date: string) => [...rows.values()].filter((c) => c.date === date),
        getOne: async (date: string, stockCode: string) => rows.get(`${date}|${stockCode}`) ?? null,
        upsert: async (c: DailyComment) => void rows.set(`${c.date}|${c.stockCode}`, c),
        remove: async (date: string, stockCode: string) => void rows.delete(`${date}|${stockCode}`),
    };
}

const D = "2026-07-01";
const CODE = "005930";

describe("DailyComments", () => {
    it("빈 코멘트 저장 = 삭제(도메인 규약)", async () => {
        const repo = fakeRepo([{ date: D, stockCode: CODE, comment: "이전 메모", author: "me" }]);
        const svc = new DailyComments(repo, "me");

        expect(await svc.save(D, CODE, "")).toBeNull();
        expect(await svc.getOne(D, CODE)).toBeNull();
    });

    it("공백만 있는 코멘트도 삭제로 본다", async () => {
        const repo = fakeRepo([{ date: D, stockCode: CODE, comment: "이전 메모", author: "me" }]);
        const svc = new DailyComments(repo, "me");

        await svc.save(D, CODE, "   \n  ");
        expect(await svc.getOne(D, CODE)).toBeNull();
    });

    it("저장은 앞뒤 공백을 떼고 author 를 서버 값으로 박는다(클라가 못 정한다)", async () => {
        const repo = fakeRepo();
        const svc = new DailyComments(repo, "서버계정");

        const saved = await svc.save(D, CODE, "  갭 상승 관찰  ");
        expect(saved).toEqual({ date: D, stockCode: CODE, comment: "갭 상승 관찰", author: "서버계정" });
        expect(await svc.getOne(D, CODE)).toMatchObject({ comment: "갭 상승 관찰", author: "서버계정" });
    });

    it("같은 (날짜,종목) 재저장은 덮어쓴다(종목당 당일 1개)", async () => {
        const repo = fakeRepo();
        const svc = new DailyComments(repo, "me");

        await svc.save(D, CODE, "처음");
        await svc.save(D, CODE, "고침");
        expect(repo.rows.size).toBe(1);
        expect(await svc.getOne(D, CODE)).toMatchObject({ comment: "고침" });
    });

    it("없는 (날짜,종목)은 null — 팝업이 빈 칸으로 연다", async () => {
        const svc = new DailyComments(fakeRepo(), "me");
        expect(await svc.getOne(D, "000660")).toBeNull();
    });
});
