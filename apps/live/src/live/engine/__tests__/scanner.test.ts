import { describe, it, expect } from "vitest";
import type { KiwoomWs } from "@trade-data-manager/kiwoom/ws";
import { RankingScanner } from "../scanner.js";

type Frame = Record<string, unknown>;

// 스캐너가 쓰는 최소 표면(request/onReal)만 가진 가짜 WS.
function fakeWs(conditions: [string, string][], initialRows: Array<Record<string, string>>) {
    const sent: Frame[] = [];
    const realHandlers: Array<(f: Frame) => void> = [];
    const ws = {
        request: async (frame: Frame) => {
            sent.push(frame);
            if (frame.trnm === "CNSRLST") return { trnm: "CNSRLST", data: conditions };
            if (frame.trnm === "CNSRREQ") return { trnm: "CNSRREQ", seq: frame.seq, data: initialRows };
            throw new Error(`unexpected frame: ${String(frame.trnm)}`);
        },
        onReal: (cb: (f: Frame) => void) => realHandlers.push(cb),
    } as unknown as KiwoomWs;
    const pushReal = (f: Frame): void => realHandlers.forEach((h) => h(f));
    return { ws, sent, realHandlers, pushReal };
}

const realFrame = (values: Record<string, string>, item?: string): Frame => ({
    trnm: "REAL",
    data: [{ type: "02", name: "조건검색", item, values }],
});

describe("RankingScanner(실시간)", () => {
    it("init: 이름으로 seq 확정, 없으면 목록과 함께 throw", async () => {
        const { ws } = fakeWs([["1", "급등주"], ["7", "거래대금"]], []);
        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        expect(s.conditionSeq).toBe("7");

        const missing = new RankingScanner(ws, "없는조건");
        await expect(missing.init()).rejects.toThrow(/없는조건.*없음/s);
    });

    it("register: search_type=1 전송 + 초기 목록 시딩(A접두 제거·이름)", async () => {
        const { ws, sent } = fakeWs([["7", "거래대금"]], [
            { "9001": "A005930", "302": "삼성전자" },
            { "9001": "A000660", "302": "SK하이닉스" },
        ]);
        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        await s.register();
        const req = sent.find((f) => f.trnm === "CNSRREQ");
        expect(req).toMatchObject({ seq: "7", search_type: "1" });
        expect(s.current()).toEqual([
            { code: "005930", name: "삼성전자" },
            { code: "000660", name: "SK하이닉스" },
        ]);
    });

    it("REAL 편입(I) 추가·이탈(D) 제거 — 코드는 9001, 이름 미상은 빈 문자열", async () => {
        const { ws, pushReal } = fakeWs([["7", "거래대금"]], [{ "9001": "A005930", "302": "삼성전자" }]);
        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        await s.register();

        pushReal(realFrame({ "841": "7", "9001": "A035420", "843": "I" }));
        expect(s.current()).toContainEqual({ code: "035420", name: "" });

        pushReal(realFrame({ "841": "7", "9001": "A005930", "843": "D" }));
        expect(s.current().map((h) => h.code)).toEqual(["035420"]);
    });

    it("다른 조건식(841 불일치)·조건검색 아닌 REAL(843 없음)은 무시", async () => {
        const { ws, pushReal } = fakeWs([["7", "거래대금"]], []);
        const s = new RankingScanner(ws, "거래대금");
        await s.init();
        await s.register();

        pushReal(realFrame({ "841": "3", "9001": "A035420", "843": "I" })); // 다른 조건식
        pushReal({ trnm: "REAL", data: [{ type: "0B", item: "A035420", values: { "10": "70000" } }] }); // 체결 프레임
        pushReal({ trnm: "REAL" }); // data 없음
        expect(s.current()).toEqual([]);

        pushReal(realFrame({ "9001": "A035420", "843": "I" })); // 841 없음 → 단일 조건 운용이라 수용
        expect(s.current().map((h) => h.code)).toEqual(["035420"]);
    });

    it("재등록: 초기 목록으로 원자 스왑(끊긴 동안의 drift 보정) + REAL 핸들러 중복 바인딩 없음", async () => {
        const fake = fakeWs([["7", "거래대금"]], [{ "9001": "A005930", "302": "삼성전자" }]);
        const s = new RankingScanner(fake.ws, "거래대금");
        await s.init();
        await s.register();
        fake.pushReal(realFrame({ "841": "7", "9001": "A035420", "843": "I" })); // 편입 후
        expect(s.current()).toHaveLength(2);

        await s.register(); // 재연결 재등록 — 서버 진실(초기 목록)로 스왑
        expect(s.current()).toEqual([{ code: "005930", name: "삼성전자" }]);
        expect(fake.realHandlers).toHaveLength(1); // 두 번 register 해도 핸들러는 1개
    });
});
