import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { TossError } from "../errors.js";
import { silentLogger } from "../logger.js";
import { TossRest } from "../rest/client.js";
import { kstOf } from "../rest/kst.js";
import { createAxiosTransport, type TossHttpResponse, type TossTransport } from "../transport.js";

const SECRET = "SECRET-VALUE";
const TOKEN = "TOKEN-VALUE";

const reply = <T>(status: number, data: T, headers: Record<string, string> = {}): TossHttpResponse<T> => ({
    status,
    data,
    headers,
});
const okToken = (token = TOKEN) => reply(200, { access_token: token, expires_in: 3600 });
const okPage = (headers: Record<string, string> = {}) =>
    reply(200, { result: { candles: [], nextBefore: null } }, headers);

function makeRest(partial: Partial<TossTransport>): { rest: TossRest; get: ReturnType<typeof vi.fn>; postForm: ReturnType<typeof vi.fn> } {
    const get = vi.fn(partial.get);
    const postForm = vi.fn(partial.postForm ?? (async () => okToken()));
    const rest = new TossRest({
        transport: { get, postForm } as unknown as TossTransport,
        clientId: "ID",
        clientSecret: SECRET,
        baseUrl: "https://example.test",
        tuning: { rateLimitMs: 0, maxRetries: 2 },
        logger: silentLogger,
    });
    return { rest, get, postForm };
}

const caught = async (p: Promise<unknown>): Promise<TossError> => {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TossError);
    return err as TossError;
};

const QUERY = { symbol: "005930", interval: "1m" } as const;

describe("TossRest.getCandles", () => {
    it("토큰을 받아 Bearer 로 부르고 result 를 풀어 유량 헤더와 함께 돌려준다", async () => {
        const { rest, get, postForm } = makeRest({
            get: (async () =>
                reply(
                    200,
                    { result: { candles: [{ timestamp: "t" }], nextBefore: "n" } },
                    { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "19", "x-ratelimit-reset": "1" },
                )) as TossTransport["get"],
        });
        const page = await rest.getCandles({ ...QUERY, count: 200, before: "2022-11-24T00:00:00+09:00", adjusted: false });

        expect(postForm).toHaveBeenCalledWith("https://example.test/oauth2/token", {
            grant_type: "client_credentials",
            client_id: "ID",
            client_secret: SECRET,
        });
        expect(get).toHaveBeenCalledWith(
            "https://example.test/api/v1/candles",
            { symbol: "005930", interval: "1m", count: "200", before: "2022-11-24T00:00:00+09:00", adjusted: "false" },
            { Authorization: `Bearer ${TOKEN}` },
        );
        expect(page.nextBefore).toBe("n");
        expect(page.candles).toHaveLength(1);
        expect(page.rateLimit).toEqual({ limit: "20", remaining: "19", reset: "1" });
    });

    it("토큰은 두 번째 요청부터 다시 받지 않고, 동시 요청도 발급 하나로 모은다", async () => {
        const { rest, postForm } = makeRest({ get: (async () => okPage()) as TossTransport["get"] });
        await Promise.all([rest.getCandles(QUERY), rest.getCandles(QUERY)]);
        await rest.getCandles(QUERY);
        expect(postForm).toHaveBeenCalledTimes(1);
    });

    it("401 이면 한 번만 새로 받아 재시도한다", async () => {
        const tokens = ["OLD", "NEW"];
        const { rest, get, postForm } = makeRest({
            postForm: (async () => okToken(tokens.shift())) as TossTransport["postForm"],
            get: (async (_u: string, _p: Record<string, string>, h: Record<string, string>) =>
                h.Authorization === "Bearer NEW" ? okPage() : reply(401, { error: { code: "expired-token" } })) as TossTransport["get"],
        });
        await rest.getCandles(QUERY);
        expect(postForm).toHaveBeenCalledTimes(2);
        expect(get).toHaveBeenCalledTimes(2);
    });

    it("동시 요청이 함께 401 을 맞아도 재발급은 한 번이다", async () => {
        const tokens = ["OLD", "NEW"];
        const { rest, postForm } = makeRest({
            postForm: (async () => okToken(tokens.shift())) as TossTransport["postForm"],
            get: (async (_u: string, _p: Record<string, string>, h: Record<string, string>) =>
                h.Authorization === "Bearer NEW" ? okPage() : reply(401, {})) as TossTransport["get"],
        });
        await Promise.all([rest.getCandles(QUERY), rest.getCandles(QUERY), rest.getCandles(QUERY)]);
        expect(postForm).toHaveBeenCalledTimes(2); // 첫 발급 + 재발급 1
    });

    it("200 인데 result 가 없으면 조용히 넘기지 않고 실패한다", async () => {
        const { rest } = makeRest({ get: (async () => reply(200, {})) as TossTransport["get"] });
        const err = await caught(rest.getCandles(QUERY));
        expect(err.meta?.http).toBe(200);
    });

    it("재발급 뒤에도 401 이면 재발급을 반복하지 않고 실패한다(같은 키의 다른 프로세스와 밀어내기 방지)", async () => {
        const { rest, postForm } = makeRest({
            get: (async () => reply(401, { error: { code: "invalid-token" } })) as TossTransport["get"],
        });
        const err = await caught(rest.getCandles(QUERY));
        expect(err.meta?.code).toBe("invalid-token");
        expect(postForm).toHaveBeenCalledTimes(2);
    });

    it("429 는 Retry-After 만큼 기다려 재시도하고, 횟수를 넘기면 실패한다", async () => {
        const answers = [reply(429, {}, { "retry-after": "0" }), okPage()];
        const first = makeRest({ get: (async () => answers.shift()!) as TossTransport["get"] });
        await first.rest.getCandles(QUERY);
        expect(first.get).toHaveBeenCalledTimes(2);

        const second = makeRest({ get: (async () => reply(429, {}, { "retry-after": "0" })) as TossTransport["get"] });
        const err = await caught(second.rest.getCandles(QUERY));
        expect(err.meta?.http).toBe(429);
        expect(second.get).toHaveBeenCalledTimes(3); // 첫 시도 + maxRetries 2
    });

    it("없는 종목은 코드로 가를 수 있게 던지고, 비밀값을 싣지 않는다", async () => {
        const { rest } = makeRest({
            get: (async () =>
                reply(404, { error: { requestId: "r", code: "stock-not-found", message: "없음" } })) as TossTransport["get"],
        });
        const err = await caught(rest.getCandles(QUERY));
        expect(err.meta?.code).toBe("stock-not-found");
        const seen = JSON.stringify({ message: err.message, stack: err.stack, meta: err.meta });
        expect(seen).not.toContain(SECRET);
        expect(seen).not.toContain(TOKEN);
    });
});

describe("kstOf", () => {
    it("오프셋 표기가 달라도 같은 KST 시각으로 맞춘다", () => {
        expect(kstOf("2023-06-15T09:01:00+09:00")).toEqual({ date: "2023-06-15", time: "09:01:00" });
        expect(kstOf("2023-06-15T00:01:00Z")).toEqual({ date: "2023-06-15", time: "09:01:00" });
        expect(kstOf("2023-06-14T15:00:00Z")).toEqual({ date: "2023-06-15", time: "00:00:00" }); // 일봉 현지 자정
    });
});

describe("TossRest.getMinuteCandlesForDate", () => {
    const DATE = "2023-06-15";
    const T = (hm: string) => `${DATE}T${hm}:00+09:00`;
    const bar = (timestamp: string) => ({ timestamp, openPrice: "1", highPrice: "1", lowPrice: "1", closePrice: "1", volume: "1", currency: "KRW" });
    const answer = (timestamps: string[], nextBefore: string | null) => reply(200, { result: { candles: timestamps.map(bar), nextBefore } });
    const restWith = (pages: ReturnType<typeof answer>[]) =>
        makeRest({
            get: (async () => {
                const next = pages.shift();
                if (!next) throw new Error("페이지를 더 부르면 안 된다");
                return next;
            }) as TossTransport["get"],
        });

    it("before 로 그날 끝에서 시작해 그날 봉만 시간 오름차순으로 모으고, 앞선 날이 보이면 멈춘다", async () => {
        const { rest, get } = restWith([
            answer([T("15:31"), T("15:30")], T("15:29")),
            answer([T("15:29"), "2023-06-14T15:31:00+09:00"], "2023-06-14T15:30:00+09:00"),
        ]);
        const r = await rest.getMinuteCandlesForDate("005930", DATE);
        expect(r.candles.map((c) => c.kstTime)).toEqual(["15:29:00", "15:30:00", "15:31:00"]);
        expect(r.pages).toBe(2);
        expect(get.mock.calls[0][1]).toMatchObject({ before: `${DATE}T23:59:59+09:00`, adjusted: "false", count: "200" });
    });

    it("구간을 주면 to 에서 시작하고 from 앞의 봉이 보이면 다음 쪽을 부르지 않는다", async () => {
        const { rest, get } = restWith([answer([T("09:02"), T("09:01"), T("09:00")], T("08:59"))]);
        const r = await rest.getMinuteCandlesForDate("005930", DATE, { window: { from: "09:01:00", to: "15:31:00" } });
        expect(r.candles.map((c) => c.kstTime)).toEqual(["09:01:00", "09:02:00"]);
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][1]).toMatchObject({ before: `${DATE}T15:31:00+09:00` });
    });

    it("페이지 경계에서 겹친 봉은 한 번만 세고 겹친 수를 남긴다", async () => {
        const { rest } = restWith([answer([T("15:31"), T("15:30")], T("15:30")), answer([T("15:30"), T("15:29")], null)]);
        const r = await rest.getMinuteCandlesForDate("005930", DATE);
        expect(r.candles).toHaveLength(3);
        expect(r.duplicates).toBe(1);
    });

    it("빈 페이지여도 nextBefore 가 있으면 계속 간다 — 그날 봉을 자르지 않는다", async () => {
        const { rest } = restWith([answer([], T("15:31")), answer([T("15:31")], null)]);
        expect((await rest.getMinuteCandlesForDate("005930", DATE)).candles).toHaveLength(1);
    });

    it("커서가 전진하지 않으면 끝없이 돌지 않고 실패한다", async () => {
        const stuck = `${DATE}T23:59:59+09:00`;
        const { rest } = restWith([answer([T("15:31")], stuck)]);
        await expect(rest.getMinuteCandlesForDate("005930", DATE)).rejects.toThrow("전진하지 않는다");
    });
});

describe("TossRest.issueToken", () => {
    it("칸 이름과 허용된 칸만 돌려준다 — 토큰류의 값은 어떤 칸이든 나오지 않는다", async () => {
        const { rest } = makeRest({
            postForm: (async () =>
                reply(200, { access_token: TOKEN, refresh_token: SECRET, expires_in: 3600 })) as TossTransport["postForm"],
        });
        const info = await rest.issueToken();
        expect(info.fieldNames).toEqual(["access_token", "refresh_token", "expires_in"]);
        expect(info.expires_in).toBe(3600);
        expect(JSON.stringify(info)).not.toContain(TOKEN);
        expect(JSON.stringify(info)).not.toContain(SECRET);
    });

    it("OAuth 표준 형태의 오류도 코드와 설명을 살린다", async () => {
        const { rest } = makeRest({
            postForm: (async () =>
                reply(401, { error: "invalid_client", error_description: "잘못된 클라이언트" })) as TossTransport["postForm"],
        });
        const err = await caught(rest.issueToken());
        expect(err.meta?.code).toBe("invalid_client");
        expect(err.message).toContain("잘못된 클라이언트");
    });

    it("access_token 이 없으면 실패한다", async () => {
        const { rest } = makeRest({
            postForm: (async () => reply(403, { error: { code: "forbidden-ip" } })) as TossTransport["postForm"],
        });
        const err = await caught(rest.issueToken());
        expect(err.meta?.code).toBe("forbidden-ip");
    });
});

describe("createAxiosTransport", () => {
    it("before 의 + 를 %2B 로 보낸다(토스 문서의 함정 — 공백으로 풀리면 시각이 깨진다)", async () => {
        let seenUrl = "";
        const server = http.createServer((req, res) => {
            seenUrl = req.url ?? "";
            res.setHeader("X-RateLimit-Limit", "20");
            res.setHeader("Content-Type", "application/json");
            res.end("{}");
        });
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        try {
            const { port } = server.address() as AddressInfo;
            const res = await createAxiosTransport({ timeoutMs: 2000 }).get(
                `http://127.0.0.1:${port}/api/v1/candles`,
                { before: "2026-03-25T09:00:00+09:00" },
                {},
            );
            expect(seenUrl).toContain("%2B09");
            expect(seenUrl).not.toContain("+09");
            expect(res.headers["x-ratelimit-limit"]).toBe("20");
        } finally {
            await new Promise((r) => server.close(r));
        }
    });

    it("네트워크 오류에 토큰·비밀값을 싣지 않는다", async () => {
        const transport = createAxiosTransport({ timeoutMs: 2000 });
        // 1번 포트는 닫혀 있어 즉시 연결 실패한다 — 바깥으로 나가지 않는다.
        const getErr = await caught(transport.get("http://127.0.0.1:1/x", {}, { Authorization: `Bearer ${TOKEN}` }));
        const postErr = await caught(transport.postForm("http://127.0.0.1:1/x", { client_secret: SECRET }));
        for (const err of [getErr, postErr]) {
            const seen = JSON.stringify({ message: err.message, stack: err.stack, meta: err.meta });
            expect(seen).not.toContain(TOKEN);
            expect(seen).not.toContain(SECRET);
            expect(err.cause).toBeUndefined();
        }
    });
});
