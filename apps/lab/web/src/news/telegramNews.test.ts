// 텔레그램 결과 다루기(순수) — 합치기 · 구간 걷기 · 수집 범위 · 경로 시각 이후.
import { describe, expect, it } from "vitest";
import type { TelegramNewsItem } from "../market/types.js";
import { addDays, coverageLabel, coverageOf, nextWindow, previewHits, telegramItems, telegramLaterCount } from "./telegramNews.js";

const at = (date: string, hm: string): string => new Date(`${date}T${hm}:00+09:00`).toISOString();
const item = (ref: string, date: string, hm: string): TelegramNewsItem => ({ channel: "방", at: at(date, hm), text: ref, ref });

describe("telegramItems", () => {
    it("페이지를 합치며 ref 중복을 걷고 최신순으로", () => {
        const p1 = { items: [item("a", "2026-07-31", "09:00"), item("b", "2026-07-31", "10:00")] };
        const p2 = { items: [item("b", "2026-07-31", "10:00"), item("c", "2026-07-30", "15:00")] };
        expect(telegramItems([p1, p2]).map((x) => x.ref)).toEqual(["b", "a", "c"]);
        expect(telegramItems(undefined)).toEqual([]);
        const broken = { ...item("x", "2026-07-31", "09:00"), at: "깨짐" };
        expect(telegramItems([{ items: [broken, item("a", "2026-07-31", "09:00")] }]).map((x) => x.ref)).toEqual(["a", "x"]);
    });
});

describe("previewHits — 본문에 없는 검색어가 미리보기에서 맞았나", () => {
    const it0 = { ...item("삼전닉스가 80% 부담", "2026-10-12", "09:00"), preview: { title: "반도체 보조금 협상", description: "삼성전자와 SK하이닉스가 80%를 부담한다" } };
    it("본문에 없는 낱말이 맞은 칸만", () => {
        expect(previewHits(it0, ["삼성전자"])).toEqual({ description: "삼성전자와 SK하이닉스가 80%를 부담한다" });
        expect(previewHits(it0, ["보조금", "sk하이닉스"])).toEqual({ title: "반도체 보조금 협상", description: "삼성전자와 SK하이닉스가 80%를 부담한다" });
    });
    it("낱말이 다 본문에 있거나 · 검색어가 없거나 · 미리보기가 없거나 · 미리보기에도 없으면 null", () => {
        expect(previewHits(it0, ["삼전닉스"])).toBeNull();
        expect(previewHits(it0, [])).toBeNull();
        expect(previewHits(item("x", "2026-10-12", "09:00"), ["삼성전자"])).toBeNull();
        expect(previewHits(it0, ["카카오"])).toBeNull();
        expect(previewHits(it0, ["", "  "])).toBeNull(); // 빈 낱말은 늘 맞는 것으로 치지 않는다
    });
    it("낱말이 본문과 미리보기에 나뉘면 본문에 없는 낱말이 맞은 칸만", () => {
        expect(previewHits(it0, ["삼전닉스", "보조금"])).toEqual({ title: "반도체 보조금 협상" });
    });
    it("본문 쪽도 대소문자를 가리지 않는다", () => {
        const sk = { ...item("SK하이닉스 급등", "2026-10-12", "09:00"), preview: { title: "sk 관련" } };
        expect(previewHits(sk, ["sk"])).toBeNull();
    });
    it("긴 설명은 맞은 낱말 앞뒤만 — 잘린 쪽에 …", () => {
        const long = { ...item("x", "2026-10-12", "09:00"), preview: { description: `${"가".repeat(100)}삼성전자${"나".repeat(200)}` } };
        const d = previewHits(long, ["삼성전자"])!.description!;
        expect(d.startsWith("…가")).toBe(true);
        expect(d.endsWith("나…")).toBe(true);
        expect(d.indexOf("삼성전자")).toBe(21); // "…" + 앞 20자
        expect(d.length).toBe(122);
    });
});

describe("nextWindow — 더보기 구간", () => {
    // 수집은 07-20 09:00 KST 부터, 10-14 16:29 KST 까지
    const cov = { from: new Date("2026-07-20T09:00:00+09:00").toISOString(), to: new Date("2026-10-14T16:29:00+09:00").toISOString() };
    it("limit 에 걸렸으면 같은 구간을 이어 받는다", () => {
        expect(nextWindow({ from: "2026-07-31", to: "2026-07-31" }, { nextBefore: "c1" }, cov)).toEqual({ from: "2026-07-31", to: "2026-07-31", before: "c1" });
    });
    it("아니면 바로 앞 한 주(달력) — 수집 시작보다 앞으로는 안 간다", () => {
        expect(nextWindow({ from: "2026-07-31", to: "2026-07-31" }, {}, cov)).toEqual({ from: "2026-07-24", to: "2026-07-30" });
        expect(nextWindow({ from: "2026-07-24", to: "2026-07-30" }, {}, cov)).toEqual({ from: "2026-07-20", to: "2026-07-23" });
        expect(nextWindow({ from: "2026-07-20", to: "2026-07-23" }, {}, cov)).toBeUndefined();
    });
    it("이어 받던 구간(before) 다음엔 before 를 버리고 앞 한 주로", () => {
        expect(nextWindow({ from: "2026-07-31", to: "2026-07-31", before: "c1" }, {}, cov)).toEqual({ from: "2026-07-24", to: "2026-07-30" });
    });
    it("수집 범위를 모르면(null) 더 가지 않는다", () => {
        expect(nextWindow({ from: "2026-07-31", to: "2026-07-31" }, {}, null)).toBeUndefined();
    });
    it("addDays — 달 · 해 경계", () => {
        expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
        expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    });
});

describe("coverageOf — 그 날짜가 수집 범위 안인가", () => {
    const cov = { from: new Date("2026-07-20T09:00:00+09:00").toISOString(), to: new Date("2026-10-14T16:29:00+09:00").toISOString() };
    it("안 · 수집 시작일(그 시각부터) · 수집 끝 날(그 시각까지) · 시작 전 · 아직 안 받은 날 · 모름", () => {
        expect(coverageOf("2026-07-31", cov)).toEqual({ kind: "ok" });
        expect(coverageOf("2026-07-20", cov)).toEqual({ kind: "partial", since: "09:00" });
        expect(coverageOf("2026-10-14", cov)).toEqual({ kind: "partial", until: "16:29" });
        expect(coverageOf("2026-07-19", cov)).toEqual({ kind: "before", start: "2026-07-20" });
        expect(coverageOf("2026-10-15", cov)).toEqual({ kind: "after" });
        expect(coverageOf("2026-07-31", null)).toEqual({ kind: "unknown" });
    });
    it("KST 와 UTC 날짜가 갈리는 시각도 KST 로 — 07:30 KST(전날 22:30Z)에 끝난 수집은 그 KST 날의 07:30 까지", () => {
        const c = { from: "2026-07-19T15:00:00.000Z" /* 07-20 00:00 KST */, to: "2026-10-14T22:30:00.000Z" /* 10-15 07:30 KST */ };
        expect(coverageOf("2026-07-20", c)).toEqual({ kind: "ok" }); // 00:00 부터면 빠짐없이
        expect(coverageOf("2026-10-14", c)).toEqual({ kind: "ok" });
        expect(coverageOf("2026-10-15", c)).toEqual({ kind: "partial", until: "07:30" });
    });
    it("00:00 판정은 초까지 — 00:00:40 부터면 그날도 일부만", () => {
        const c = { from: "2026-07-19T15:00:40.000Z" /* 07-20 00:00:40 KST */, to: "2026-08-14T07:29:00.000Z" };
        expect(coverageOf("2026-07-20", c)).toEqual({ kind: "partial", since: "00:00" });
    });
    it("한 줄 표시", () => {
        expect(coverageLabel({ kind: "ok" })).toBeNull();
        expect(coverageLabel({ kind: "partial", since: "09:00", until: "16:29" })).toBe("09:00~16:29만 빠짐없음");
        expect(coverageLabel({ kind: "partial", since: "09:00" })).toBe("09:00부터 빠짐없음(그 앞은 일부 방만)");
        expect(coverageLabel({ kind: "partial", until: "16:29" })).toBe("16:29까지 빠짐없음");
    });
    it("수집 범위 앞의 날 — 메시지가 있으면 일부 방만, 없으면 수집 전, 검색어로 걸러 비었으면 모름", () => {
        const b = { kind: "before", start: "2026-07-20" } as const;
        expect(coverageLabel(b, "some")).toBe("일부 방만 수집된 날짜 — 2026-07-20부터 빠짐없음");
        expect(coverageLabel(b, "none")).toBe("수집 전 날짜 — 2026-07-20부터 빠짐없음");
        expect(coverageLabel(b, "unknown")).toBe("수집 전이거나 일부 방만 든 날짜 — 2026-07-20부터 빠짐없음");
    });
});

describe("telegramLaterCount", () => {
    it("경로 시각보다 나중 메시지 수(분 단위, 날짜를 넘어서도) — 최신순 앞에서부터", () => {
        const items = [item("d", "2026-07-31", "10:20"), item("c", "2026-07-31", "10:00"), item("b", "2026-07-31", "09:59"), item("a", "2026-07-30", "15:00")];
        expect(telegramLaterCount(items, "2026-07-31", "10:00")).toBe(1);
        expect(telegramLaterCount(items, "2026-07-31", "09:00")).toBe(3);
        expect(telegramLaterCount(items, "2026-07-31", "11:00")).toBe(0);
        const half = [{ ...item("x", "2026-07-31", "10:00"), at: "2026-07-31T01:00:30.000Z" }]; // 10:00:30 KST — 같은 분 = 앎
        expect(telegramLaterCount(half, "2026-07-31", "10:00")).toBe(0);
        expect(telegramLaterCount(items, "2026-07-30", "16:00")).toBe(3); // 경로가 전날이면 7/31 메시지는 전부 나중
    });
});
