import { describe, it, expect } from "vitest";
import type { KiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { RankingScanner } from "../scanner.js";

type Frame = Record<string, unknown>;

// 스캐너가 쓰는 최소 표면(request)만 가진 가짜 WS.
function fakeWs(conditions: [string, string][], rows: Array<Record<string, string>>) {
    const sent: Frame[] = [];
    const ws = {
        request: async (frame: Frame) => {
            sent.push(frame);
            if (frame.trnm === "CNSRLST") return { trnm: "CNSRLST", data: conditions };
            if (frame.trnm === "CNSRREQ") return { trnm: "CNSRREQ", seq: frame.seq, data: rows };
            throw new Error(`unexpected frame: ${String(frame.trnm)}`);
        },
    } as unknown as KiwoomWs;
    return { ws, sent };
}

describe("RankingScanner(일반 재조회 폴링)", () => {
    it("init: 이름으로 seq 확정, 없으면 목록과 함께 throw", async () => {
        const { ws } = fakeWs([["1", "급등주"], ["7", "거래대금"]], []);
        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        expect(s.conditionSeq).toBe("7");

        const missing = new RankingScanner(ws, "없는조건");
        await expect(missing.init()).rejects.toThrow(/없는조건.*없음/s);
    });

    it("scan: search_type=0 재조회 + 행 매핑(A접두 제거·이름 trim)", async () => {
        const { ws, sent } = fakeWs([["7", "거래대금"]], [
            { "9001": "A005930", "302": "삼성전자 " },
            { "9001": "A000660", "302": "SK하이닉스" },
        ]);
        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        const hits = await s.scan();
        const req = sent.find((f) => f.trnm === "CNSRREQ");
        expect(req).toMatchObject({ seq: "7", search_type: "0" });
        expect(hits).toEqual([
            { code: "005930", name: "삼성전자" },
            { code: "000660", name: "SK하이닉스" },
        ]);
    });

    it("scan: 에러 프레임(return_code≠0)은 빈 목록이 아니라 throw — 서버 메시지 노출", async () => {
        const ws = {
            request: async (frame: Frame) => {
                if (frame.trnm === "CNSRLST") return { trnm: "CNSRLST", return_code: 0, data: [["7", "거래대금"]] };
                return { trnm: "CNSRREQ", seq: frame.seq, return_code: 1, return_msg: "조회 횟수 초과" };
            },
        } as unknown as KiwoomWs;
        const s = new RankingScanner(ws, "거래대금");
        await s.init(); // return_code=0 은 통과
        await expect(s.scan()).rejects.toThrow(/CNSRREQ 실패.*조회 횟수 초과/);
    });

    it("scan: init 전 호출은 throw, 매 호출이 재조회(폴링 — 두 번째도 CNSRREQ 전송)", async () => {
        const { ws, sent } = fakeWs([["7", "거래대금"]], []);
        const uninit = new RankingScanner(ws, "거래대금");
        await expect(uninit.scan()).rejects.toThrow(/init/);

        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        await s.scan();
        await s.scan();
        expect(sent.filter((f) => f.trnm === "CNSRREQ")).toHaveLength(2);
    });
});
