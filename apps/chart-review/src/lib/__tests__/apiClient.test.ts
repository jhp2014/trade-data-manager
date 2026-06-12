import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, getJsonOrNull, postJson, deleteJson } from "@/lib/apiClient";

/** fetch 응답을 흉내내는 최소 객체. */
function mockResponse(ok: boolean, body: unknown): Response {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getJson", () => {
  it("성공 시 파싱된 JSON 을 반환", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(true, { value: 42 })));
    await expect(getJson("/api/x")).resolves.toEqual({ value: 42 });
  });

  it("실패 시 body.error 로 throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(false, { error: "boom" })));
    await expect(getJson("/api/x")).rejects.toThrow("boom");
  });

  it("body 파싱 실패/ error 없음 → fallbackError 로 throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("no body"); } } as unknown as Response));
    await expect(getJson("/api/x", "기본실패")).rejects.toThrow("기본실패");
  });
});

describe("getJsonOrNull", () => {
  it("성공 시 데이터", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(true, { a: 1 })));
    await expect(getJsonOrNull("/api/x")).resolves.toEqual({ a: 1 });
  });
  it("!ok 면 null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(false, {})));
    await expect(getJsonOrNull("/api/x")).resolves.toBeNull();
  });
  it("fetch 자체가 reject 면 null(에러 삼킴)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(getJsonOrNull("/api/x")).resolves.toBeNull();
  });
});

describe("postJson", () => {
  it("method POST + JSON 본문으로 호출하고 결과를 반환", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(true, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await postJson("/api/y", { a: 1 });

    expect(fetchMock).toHaveBeenCalledWith("/api/y", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
  });

  it("실패 시 fallbackError 적용", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(false, {})));
    await expect(postJson("/api/y", {}, "저장 실패")).rejects.toThrow("저장 실패");
  });
});

describe("deleteJson", () => {
  it("body 가 없으면 본문 없이 DELETE 로 호출", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse(true, {}));
    vi.stubGlobal("fetch", fetchMock);

    await deleteJson("/api/z");

    expect(fetchMock).toHaveBeenCalledWith("/api/z", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: undefined,
    });
  });
});
