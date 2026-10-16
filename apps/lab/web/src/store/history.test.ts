import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_VISITS, SETTLE_MS, returnTo, startHistoryRecording, useHistory } from "./history.js";
import { usePaths } from "./paths.js";

const h = () => useHistory.getState();
const list = () => h().visits.map((v) => `${v.code}@${v.date} ${v.time}`.trim());

beforeEach(() => {
    localStorage.clear();
    useHistory.setState({ visits: [] });
    usePaths.setState(usePaths.getInitialState(), true);
});

describe("기록 store", () => {
    it("다시 본 (종목, 날짜)는 맨 위로 — 한 줄만", () => {
        h().visit("402340", "2026-07-31", "");
        h().visit("009150", "2026-07-31", "");
        h().visit("402340", "2026-07-31", "09:44");
        expect(list()).toEqual(["402340@2026-07-31 09:44", "009150@2026-07-31"]);
    });
    it("시각만 바뀌면 자리는 그대로, 시각만 갱신", () => {
        h().visit("402340", "2026-07-31", "");
        h().visit("009150", "2026-07-31", "");
        h().touchTime("402340", "2026-07-31", "10:00");
        expect(list()).toEqual(["009150@2026-07-31", "402340@2026-07-31 10:00"]);
    });
    it("기록에 없는 것의 시각 갱신은 아무것도 안 한다", () => {
        h().touchTime("402340", "2026-07-31", "10:00");
        expect(list()).toEqual([]);
    });
    it("50개 상한 — 넘치면 가장 오래된 줄이 빠지고, 이미 있는 줄을 다시 보면 개수는 그대로", () => {
        expect(MAX_VISITS).toBe(50);
        for (let i = 0; i < 50; i++) h().visit(String(100000 + i), "2026-07-31", "");
        h().visit("999999", "2026-07-31", "");
        expect(h().visits).toHaveLength(50);
        expect(h().visits[0].code).toBe("999999");
        expect(h().visits.some((v) => v.code === "100000")).toBe(false);
        h().visit("100030", "2026-07-31", "");
        expect(h().visits).toHaveLength(50);
        expect(h().visits[0].code).toBe("100030");
    });
    it("v1 저장본(최대 200)은 최신 50개만 남긴다", async () => {
        const visits = Array.from({ length: 120 }, (_, i) => ({ code: String(200000 + i), date: "2026-07-31", time: "", at: 0 }));
        localStorage.setItem("trade-lab.history", JSON.stringify({ state: { visits }, version: 1 }));
        await useHistory.persist.rehydrate();
        expect(h().visits).toHaveLength(50);
        expect(h().visits[0].code).toBe("200000");
    });
    it("지우기", () => {
        h().visit("402340", "2026-07-31", "");
        h().visit("009150", "2026-07-31", "");
        h().remove("402340", "2026-07-31");
        expect(list()).toEqual(["009150@2026-07-31"]);
    });
});

describe("경로 변경 기록", () => {
    let stop: () => void = () => {};
    beforeEach(() => {
        vi.useFakeTimers();
        stop = startHistoryRecording();
    });
    afterEach(() => {
        stop();
        vi.useRealTimers();
    });
    const write = (id: string, patch: Parameters<ReturnType<typeof usePaths.getState>["write"]>[1]) => usePaths.getState().write(id, patch);

    it("멈춘 뒤에만 기록 — 연달아 바뀌는 중간 조합(새 종목, 옛 날짜)은 남지 않는다", () => {
        write("A", { code: "402340", date: "2026-07-31" });
        vi.advanceTimersByTime(SETTLE_MS);
        write("A", { code: "009150" }); // 아직 날짜는 옛 것
        vi.advanceTimersByTime(SETTLE_MS / 2);
        write("A", { date: "2026-07-15" });
        vi.advanceTimersByTime(SETTLE_MS);
        expect(list()).toEqual(["009150@2026-07-15", "402340@2026-07-31"]);
    });
    it("종목·날짜가 다 있을 때만", () => {
        write("A", { code: "402340" });
        vi.advanceTimersByTime(SETTLE_MS);
        expect(list()).toEqual([]);
    });
    it("시각만 바뀌면 그 줄의 시각만", () => {
        write("A", { code: "402340", date: "2026-07-31" });
        vi.advanceTimersByTime(SETTLE_MS);
        write("B", { code: "009150", date: "2026-07-31" });
        vi.advanceTimersByTime(SETTLE_MS);
        write("A", { time: "09:44" });
        vi.advanceTimersByTime(SETTLE_MS);
        expect(list()).toEqual(["009150@2026-07-31", "402340@2026-07-31 09:44"]);
    });
    it("기록에서 눌러 돌아가면 순서를 바꾸지 않는다 — 시각만 그 줄의 것으로", () => {
        write("A", { code: "402340", date: "2026-07-31", time: "09:44" });
        vi.advanceTimersByTime(SETTLE_MS);
        write("A", { code: "009150", time: "" });
        vi.advanceTimersByTime(SETTLE_MS);
        returnTo("A", h().visits[1]); // 아래 줄(402340)로
        vi.advanceTimersByTime(SETTLE_MS);
        expect(usePaths.getState().paths.find((p) => p.id === "A")?.s).toMatchObject({ code: "402340", time: "09:44" });
        expect(list()).toEqual(["009150@2026-07-31", "402340@2026-07-31 09:44"]);
        // 그 뒤 직접 다른 종목을 넣으면 평소처럼 맨 위로 기록된다
        write("A", { code: "005930" });
        vi.advanceTimersByTime(SETTLE_MS);
        expect(list()[0]).toBe("005930@2026-07-31 09:44");
    });
    it("경로마다 따로 기다린다", () => {
        write("A", { code: "402340", date: "2026-07-31" });
        write("B", { code: "009150", date: "2026-07-31" });
        vi.advanceTimersByTime(SETTLE_MS);
        expect(list().sort()).toEqual(["009150@2026-07-31", "402340@2026-07-31"]);
    });
});
