import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { DartError } from "../errors.js";
import { silentLogger } from "../logger.js";
import { DartRest } from "../rest/client.js";
import { parseCorpCodeXml } from "../rest/corpCodeXml.js";
import { createAxiosTransport, type DartTransport } from "../transport.js";

const KEY = "SECRET-KEY";

function makeRest(partial: Partial<DartTransport>): DartRest {
    const transport: DartTransport = {
        getJson: vi.fn(),
        getBytes: vi.fn(),
        ...partial,
    } as DartTransport;
    return new DartRest({
        transport,
        apiKey: KEY,
        baseUrl: "https://example.test/api",
        tuning: { rateLimitMs: 0 },
        logger: silentLogger,
    });
}

const caught = async (p: Promise<unknown>): Promise<DartError> => {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DartError);
    return err as DartError;
};

describe("createAxiosTransport", () => {
    it("네트워크 오류에 인증키를 싣지 않는다(axios 에러의 config 를 그대로 흘리지 않는다)", async () => {
        const transport = createAxiosTransport({ timeoutMs: 2000 });
        // 1번 포트는 닫혀 있어 즉시 연결 실패한다 — 바깥으로 나가지 않는다.
        const err = await caught(transport.getJson("http://127.0.0.1:1/api/list.json", { crtfc_key: KEY }));
        // 배열 replacer 를 쓰면 meta 속 칸이 직렬화에서 빠져 단언이 비게 된다 — 평범하게 직렬화한다.
        const seen = JSON.stringify({ message: err.message, stack: err.stack, meta: err.meta });
        expect(seen).not.toContain(KEY);
        expect(err.cause).toBeUndefined();
    });
});

describe("parseCorpCodeXml", () => {
    it("빈 종목코드는 null, 엔티티는 풀고 앞뒤 공백은 지운다", () => {
        const xml = `<result>
          <list><corp_code>00126380</corp_code><corp_name>삼성&amp;전자</corp_name><corp_eng_name>SEC</corp_eng_name><stock_code>005930</stock_code><modify_date>20261101</modify_date></list>
          <list><corp_code>00000001</corp_code><corp_name>비상장</corp_name><corp_eng_name></corp_eng_name><stock_code> </stock_code><modify_date>20200101</modify_date></list>
        </result>`;
        expect(parseCorpCodeXml(xml)).toEqual([
            { corpCode: "00126380", corpName: "삼성&전자", corpEngName: "SEC", stockCode: "005930", modifyDate: "20261101" },
            { corpCode: "00000001", corpName: "비상장", corpEngName: null, stockCode: null, modifyDate: "20200101" },
        ]);
    });
});

describe("DartRest", () => {
    it("searchDisclosures — 쿼리를 DART 이름으로 옮기고 키를 붙인다", async () => {
        const getJson = vi.fn().mockResolvedValue({ status: 200, data: { status: "000", message: "정상", list: [] } });
        await makeRest({ getJson }).searchDisclosures({ corpCode: "00126380", lastReprtAt: "N", pageNo: 2, pageCount: 100 });
        expect(getJson).toHaveBeenCalledWith("https://example.test/api/list.json", {
            crtfc_key: KEY,
            corp_code: "00126380",
            last_reprt_at: "N",
            page_no: "2",
            page_count: "100",
        });
    });

    it("searchDisclosures — 013(없음)은 빈 목록으로 돌려준다", async () => {
        const getJson = vi.fn().mockResolvedValue({ status: 200, data: { status: "013", message: "없음" } });
        const res = await makeRest({ getJson }).searchDisclosures({ corpCode: "1" });
        expect(res.list).toEqual([]);
    });

    it("JSON 오류 코드는 던지되 에러에 인증키가 없다", async () => {
        const getJson = vi.fn().mockResolvedValue({ status: 200, data: { status: "020", message: "요청 제한 초과" } });
        const err = await caught(makeRest({ getJson }).getCompany("00126380"));
        expect(err.meta?.status).toBe("020");
        expect(`${err.message}${JSON.stringify(err.meta)}`).not.toContain(KEY);
    });

    it("zip 을 풀어 파일 목록으로 돌려준다", async () => {
        const zip = zipSync({ "20240101000001.xml": strToU8("<DOCUMENT/>") });
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: zip });
        const files = await makeRest({ getBytes }).getDocumentFiles("20240101000001");
        expect(files.map((f) => f.name)).toEqual(["20240101000001.xml"]);
    });

    it("zip 자리에 200 + XML 오류가 오면 코드를 풀어 던지고 인증키는 없다", async () => {
        const body = strToU8("<result><status>014</status><message>파일이 존재하지 않습니다.</message></result>");
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: body });
        const err = await caught(makeRest({ getBytes }).getDocumentFiles("20240101000001"));
        expect(err.meta?.status).toBe("014");
        expect(`${err.message}${JSON.stringify(err.meta)}`).not.toContain(KEY);
    });

    it("PK 로 시작하지만 깨진 zip 은 DartError 로 감싼다", async () => {
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: new Uint8Array([0x50, 0x4b, 0, 1, 2, 3]) });
        const err = await caught(makeRest({ getBytes }).getDocumentFiles("20240101000001"));
        expect(err.meta?.params).toEqual({ rcept_no: "20240101000001" });
    });

    it("코드를 못 뽑는 200 응답은 본문 앞부분을 남기되 인증키는 가린다", async () => {
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: strToU8(`<html>점검 중 ${KEY}</html>`) });
        const err = await caught(makeRest({ getBytes }).getDocumentFiles("20240101000001"));
        expect(err.meta?.bodyHead).toContain("점검 중");
        expect(`${err.message}${JSON.stringify(err.meta)}`).not.toContain(KEY);
    });

    it("인증키가 200자 경계에 걸려도 일부가 새지 않는다", async () => {
        const longKey = "K".repeat(40);
        const body = `<html>${"x".repeat(180)}${longKey}</html>`;
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: strToU8(body) });
        const rest = new DartRest({
            transport: { getJson: vi.fn(), getBytes },
            apiKey: longKey,
            baseUrl: "https://example.test/api",
            tuning: { rateLimitMs: 0 },
            logger: silentLogger,
        });
        const err = await caught(rest.getDocumentFiles("20240101000001"));
        expect(`${err.message}${JSON.stringify(err.meta)}`).not.toContain("KKKK");
    });

    it("message 칸에 되비친 인증키도 가린다", async () => {
        const body = strToU8(`<result><message>bad ${KEY}</message></result>`);
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: body });
        const err = await caught(makeRest({ getBytes }).getDocumentFiles("20240101000001"));
        expect(`${err.message}${JSON.stringify(err.meta)}`).not.toContain(KEY);
    });

    it("HTTP 오류도 던지되 인증키는 없다", async () => {
        const getJson = vi.fn().mockResolvedValue({ status: 500, data: "boom" });
        const err = await caught(makeRest({ getJson }).getCompany("00126380"));
        expect(err.meta?.http).toBe(500);
        expect(`${err.message}${JSON.stringify(err.meta)}`).not.toContain(KEY);
    });

    it("로그에 인증키를 넘기지 않는다", async () => {
        const debug = vi.fn();
        const getJson = vi.fn().mockResolvedValue({ status: 200, data: { status: "000", message: "정상" } });
        const rest = new DartRest({
            transport: { getJson, getBytes: vi.fn() },
            apiKey: KEY,
            baseUrl: "https://example.test/api",
            tuning: { rateLimitMs: 0 },
            logger: { ...silentLogger, debug },
        });
        await rest.getCompany("00126380");
        expect(debug).toHaveBeenCalled();
        expect(JSON.stringify(debug.mock.calls)).not.toContain(KEY);
    });

    it("getCorpCodes — zip 안의 xml 을 파싱한다", async () => {
        const xml = "<result><list><corp_code>1</corp_code><corp_name>가</corp_name><stock_code>000001</stock_code><modify_date>20260101</modify_date></list></result>";
        const getBytes = vi.fn().mockResolvedValue({ status: 200, data: zipSync({ "CORPCODE.xml": strToU8(xml) }) });
        const corps = await makeRest({ getBytes }).getCorpCodes();
        expect(corps).toHaveLength(1);
        expect(corps[0]?.stockCode).toBe("000001");
    });
});
