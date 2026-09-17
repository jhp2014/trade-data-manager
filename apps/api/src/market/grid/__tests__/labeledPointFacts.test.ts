// LabeledPointFacts — 좌표 봉 사실(종가·고가)의 즉석 계산 + 상주 메모. 회귀 게이트: 라벨이 격자
// 사건 봉과 겹치면 값이 격자 파생과 **비트 일치**해야 한다(봉 우주 = gridSessionBars 한 자).
import { describe, expect, it } from "vitest";
import type { MinuteCandle, PointGroupMembership } from "@trade-data-manager/market";
import { detectGrid, hmsToMinute } from "@trade-data-manager/market";
import { LabeledPointFacts } from "../labeledPointFacts.js";

const TODAY = "2026-07-02";
const D = "2026-07-01";

const bar = (code: string, date: string, time: string, p: { o: number; h: number; l: number; c: number }, vol = 200000): MinuteCandle => ({
    stockCode: code,
    date,
    time,
    krx: null,
    un: { open: String(p.o), high: String(p.h), low: String(p.l), close: String(p.c), volume: String(vol) },
});

const BARS: MinuteCandle[] = [
    bar("A", D, "09:10:00", { o: 10000, h: 10050, l: 9990, c: 10040 }),
    bar("A", D, "09:11:00", { o: 10040, h: 10120, l: 10030, c: 10100 }),
    // 09:12 는 결번 — densify 가 채움봉(직전 종가 10100 평탄)으로 세운다.
    bar("A", D, "09:13:00", { o: 10100, h: 10090, l: 10050, c: 10060 }),
    bar("A", D, "07:30:00", { o: 9000, h: 9000, l: 9000, c: 9000 }), // 세션 창 밖 — 봉 우주에 없다
];

const label = (code: string, date: string, time: string): PointGroupMembership => ({ stockCode: code, date, time, groupNames: ["눌림"] });

function harness(init: { labels: PointGroupMembership[]; minutes?: Record<string, MinuteCandle[]>; beforeRead?: () => Promise<void> }) {
    let labels = init.labels;
    let nowMs = 0;
    const minuteCalls: string[] = [];
    const facts = new LabeledPointFacts({
        deps: {
            minute: {
                getMinuteCandles: async (code: string, date: string) => {
                    minuteCalls.push(`${code}|${date}`);
                    await init.beforeRead?.();
                    return init.minutes?.[`${code}|${date}`] ?? [];
                },
            },
        } as never,
        groups: { listAllPointMemberships: async () => labels },
        today: () => TODAY,
        now: () => nowMs,
    });
    return { facts, minuteCalls, setLabels: (l: PointGroupMembership[]) => (labels = l), setNow: (ms: number) => (nowMs = ms) };
}

describe("LabeledPointFacts", () => {
    it("좌표별 종가·고가(원주가 UN, 원) — 사건 봉이든 아니든 그 분 봉의 정확값", async () => {
        const h = harness({ labels: [label("A", D, "09:10:00"), label("A", D, "09:13:00")], minutes: { [`A|${D}`]: BARS } });
        const { facts } = await h.facts.bundle();
        expect(facts).toEqual([
            { stockCode: "A", date: D, time: "09:10:00", close: 10040, high: 10050 },
            { stockCode: "A", date: D, time: "09:13:00", close: 10060, high: 10090 },
        ]);
    });

    it("회귀 게이트 — 라벨이 격자 사건 봉과 겹치면 detectGrid 의 사건 봉 값과 비트 일치한다", async () => {
        const h = harness({ labels: [label("A", D, "09:11:00")], minutes: { [`A|${D}`]: BARS } });
        const { facts } = await h.facts.bundle();
        const grid = detectGrid(BARS, { base: null, prevBase: null, prevBaseKrx: null })!;
        const event = grid.newHighs.find((e) => e.min === hmsToMinute("09:11:00"))!;
        expect(facts[0].close).toBe(event.close);
        expect(facts[0].high).toBe(event.high);
    });

    it("채움봉(결번 분)도 봉 우주에 있다 — 직전 종가 평탄값이 정직한 사실이다", async () => {
        const h = harness({ labels: [label("A", D, "09:12:00")], minutes: { [`A|${D}`]: BARS } });
        const { facts } = await h.facts.bundle();
        expect(facts).toEqual([{ stockCode: "A", date: D, time: "09:12:00", close: 10100, high: 10100 }]);
    });

    it("세션 창 밖·오늘 좌표는 항목 없음(결손은 결손 — 폴백 금지)", async () => {
        const h = harness({
            labels: [label("A", D, "07:30:00"), label("A", TODAY, "09:10:00")],
            minutes: { [`A|${D}`]: BARS },
        });
        const { facts } = await h.facts.bundle();
        expect(facts).toEqual([]);
        expect(h.minuteCalls).toEqual([`A|${D}`]); // 오늘 좌표는 조회조차 안 한다
    });

    it("상주 메모 — 차트당 분봉 1회, 두 번째 요청은 0회. 라벨이 늘면 그 차트만 다시 읽는다", async () => {
        const h = harness({ labels: [label("A", D, "09:10:00")], minutes: { [`A|${D}`]: BARS, [`B|${D}`]: BARS.map((b) => ({ ...b, stockCode: "B" })) } });
        await h.facts.bundle();
        expect(h.minuteCalls).toEqual([`A|${D}`]);
        await h.facts.bundle();
        expect(h.minuteCalls).toEqual([`A|${D}`]); // 전량 메모 히트
        h.setLabels([label("A", D, "09:10:00"), label("B", D, "09:11:00")]);
        await h.facts.bundle();
        expect(h.minuteCalls).toEqual([`A|${D}`, `B|${D}`]); // A 는 메모, B 만 읽는다
    });

    it("동시 요청은 한 비행을 나눠 탄다 — 분봉 이중 읽기 없음(리뷰 A-2)", async () => {
        const h = harness({ labels: [label("A", D, "09:10:00")], minutes: { [`A|${D}`]: BARS } });
        const [a, b] = await Promise.all([h.facts.bundle(), h.facts.bundle()]);
        expect(a).toBe(b);
        expect(h.minuteCalls).toEqual([`A|${D}`]);
    });

    it("gen 가드 — 비행 중 라벨이 부착되면(invalidate) 재시도가 새 라벨을 싣는다", async () => {
        let release: () => void = () => {};
        let block = true;
        const gate = new Promise<void>((r) => (release = r));
        const h = harness({
            labels: [label("A", D, "09:10:00")],
            minutes: { [`A|${D}`]: BARS, [`B|${D}`]: BARS.map((b) => ({ ...b, stockCode: "B" })) },
            beforeRead: async () => { if (block) await gate; },
        });
        const p = h.facts.bundle(); // 편집 **전** 라벨(A)로 시작한 비행 — 분봉 문턱에서 정지
        await new Promise((r) => setTimeout(r, 0));
        h.setLabels([label("A", D, "09:10:00"), label("B", D, "09:11:00")]);
        h.facts.invalidate(); // 라벨 부착 직후 컨트롤러가 부르는 그 손
        block = false;
        release();
        const out = await p; // 재시도(gen 불일치)가 새 라벨 목록으로 다시 돌아야 한다
        expect(out.facts.map((f) => f.stockCode).sort()).toEqual(["A", "B"]);
    });

    it("좌표 결손도 TTL 음성 — 분봉 백필로 그 분이 채워지면 자가치유한다(리뷰 A-1)", async () => {
        const store: Record<string, MinuteCandle[]> = { [`A|${D}`]: [BARS[0]] }; // 09:13 미수집(부분 수집)
        const h = harness({ labels: [label("A", D, "09:13:00")], minutes: store });
        expect((await h.facts.bundle()).facts).toEqual([]);
        expect((await h.facts.bundle()).facts).toEqual([]); // TTL 안 — 차트 재조회 없음
        expect(h.minuteCalls).toEqual([`A|${D}`]);
        store[`A|${D}`] = BARS; // 백필이 그 분을 채웠다
        h.setNow(11 * 60_000); // TTL(10분) 경과
        expect((await h.facts.bundle()).facts).toEqual([{ stockCode: "A", date: D, time: "09:13:00", close: 10060, high: 10090 }]);
    });

    it("분봉 미수집 차트 — TTL 안에는 재조회하지 않고, TTL 뒤 자가치유한다", async () => {
        const minutes: Record<string, MinuteCandle[]> = {};
        const h = harness({ labels: [label("A", D, "09:10:00")], minutes });
        expect((await h.facts.bundle()).facts).toEqual([]);
        expect((await h.facts.bundle()).facts).toEqual([]); // TTL 안 — 재조회 억제
        expect(h.minuteCalls).toEqual([`A|${D}`]);
        minutes[`A|${D}`] = BARS; // 수집이 채워졌다
        h.setNow(11 * 60_000); // TTL(10분) 경과
        expect((await h.facts.bundle()).facts).toHaveLength(1);
    });
});
