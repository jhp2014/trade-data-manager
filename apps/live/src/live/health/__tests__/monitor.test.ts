import { describe, it, expect } from "vitest";
import { HealthMonitor, parseWindow, type HealthDeps } from "../monitor.js";
import type { QueueStats } from "../../alerts/notifyQueue.js";

// KST 시각 생성(한국은 DST 없음 — UTC-9h 고정). 2026-07-15 = 수요일, 07-18 = 토요일.
const kst = (d: number, hh: number, mm: number): number => Date.UTC(2026, 6, d, hh - 9, mm);
const WED = 15;
const SAT = 18;

const emptyStats = (): QueueStats => ({ pending: 0, consecutiveFailures: 0, lastOkAt: null, lastFailAt: null, enqueuedFirings: 0, droppedEntries: 0 });

function make(heartbeat = true): {
    state: { tickAt: number | null; ws: string; q: QueueStats; rules: number };
    notes: string[];
    mon: HealthMonitor;
} {
    const state = { tickAt: null as number | null, ws: "live", q: emptyStats(), rules: 2 };
    const notes: string[] = [];
    const deps: HealthDeps = {
        lastTickAt: () => state.tickAt,
        wsStatus: () => state.ws,
        queueStats: () => state.q,
        ruleCount: () => state.rules,
        notify: (text) => notes.push(text),
    };
    const mon = new HealthMonitor(deps, { windowStartMin: 8 * 60, windowEndMin: 15 * 60 + 40, heartbeat });
    return { state, notes, mon };
}

describe("parseWindow", () => {
    it("정상 파싱·형식 오류/역전은 null", () => {
        expect(parseWindow("08:00-15:40")).toEqual({ start: 480, end: 940 });
        expect(parseWindow("9:30-10:00")).toEqual({ start: 570, end: 600 });
        expect(parseWindow("x")).toBeNull();
        expect(parseWindow("15:40-08:00")).toBeNull();
        expect(parseWindow(undefined)).toBeNull();
    });
});

describe("HealthMonitor", () => {
    it("창 진입 첫 판정 = 아침 하트비트 1건(정상), 같은 날 반복 없음", () => {
        const { state, notes, mon } = make();
        state.tickAt = kst(WED, 8, 0);
        mon.check(kst(WED, 8, 0));
        expect(notes).toEqual(["✅ 알람 시스템 정상 — 조건 2개 감시 중"]);
        state.tickAt = kst(WED, 9, 0);
        mon.check(kst(WED, 9, 0));
        expect(notes).toHaveLength(1); // 하트비트 하루 1건
    });

    it("이상 상태로 창 진입(부팅) → 🚨 하트비트로 상태 보고", () => {
        const { notes, mon } = make(); // tickAt=null = 시작 실패
        mon.check(kst(WED, 9, 0));
        expect(notes).toHaveLength(1);
        expect(notes[0]).toContain("🚨 장 시작");
        expect(notes[0]).toContain("엔진 틱 없음");
    });

    it("엣지 알림 — 정상→이상 1회 🚨, 유지 침묵, 회복 1회 ✅", () => {
        const { state, notes, mon } = make();
        state.tickAt = kst(WED, 9, 0);
        mon.check(kst(WED, 9, 0)); // 하트비트(정상 기준선)
        state.tickAt = kst(WED, 9, 0); // 이후 틱 멈춤
        mon.check(kst(WED, 9, 4)); // 4분 stale → 🚨
        mon.check(kst(WED, 9, 5)); // 유지 — 침묵
        expect(notes).toHaveLength(2);
        expect(notes[1]).toContain("🚨");
        expect(notes[1]).toContain("틱 4분 중단");
        state.tickAt = kst(WED, 9, 6); // 회복
        mon.check(kst(WED, 9, 6));
        expect(notes).toHaveLength(3);
        expect(notes[2]).toContain("✅ 알람 시스템 회복");
    });

    it("전송 연속실패 4회+ 도 이상으로 판정", () => {
        const { state, notes, mon } = make();
        state.tickAt = kst(WED, 9, 0);
        mon.check(kst(WED, 9, 0)); // 하트비트
        state.tickAt = kst(WED, 9, 4);
        state.q = { ...emptyStats(), consecutiveFailures: 4, pending: 3 };
        mon.check(kst(WED, 9, 4));
        expect(notes[1]).toContain("텔레그램 전송 연속 실패 4회");
    });

    it("창 밖(주말·야간)엔 이상이어도 침묵", () => {
        const { notes, mon } = make(); // tickAt=null(이상)
        mon.check(kst(SAT, 10, 0)); // 토요일
        mon.check(kst(WED, 3, 0)); // 새벽
        expect(notes).toHaveLength(0);
    });

    it("shouldPing — 창 안=완전 건강만 true, 창 밖=항상 true(생존)", () => {
        const { state, mon } = make();
        state.tickAt = null; // 이상
        expect(mon.shouldPing(kst(WED, 10, 0))).toBe(false); // 장중 이상 → 핑 중단(데드맨 발화)
        expect(mon.shouldPing(kst(WED, 3, 0))).toBe(true); // 심야 — 프로세스 생존이면 핑(점검 오탐 방지)
        state.tickAt = kst(WED, 10, 0);
        state.ws = "live";
        expect(mon.shouldPing(kst(WED, 10, 0))).toBe(true);
    });

    it("장마감 요약 — 창 종료 후 1건, 그날 발화·폐기 수 집계", () => {
        const { state, notes, mon } = make();
        state.tickAt = kst(WED, 8, 0);
        mon.check(kst(WED, 8, 0)); // 하트비트(스냅샷 0/0)
        state.q = { ...emptyStats(), enqueuedFirings: 5, droppedEntries: 1 };
        state.tickAt = kst(WED, 15, 41);
        mon.check(kst(WED, 15, 41)); // 창 종료 직후
        expect(notes).toHaveLength(2);
        expect(notes[1]).toBe("📊 장마감 — 알람 5건 발화 · 전송실패 폐기 1건");
        mon.check(kst(WED, 15, 45)); // 반복 없음
        expect(notes).toHaveLength(2);
    });

    it("heartbeat=false — 하트비트·요약 없음, 창 안 엣지 알림은 동작", () => {
        const { state, notes, mon } = make(false);
        state.tickAt = kst(WED, 9, 0);
        mon.check(kst(WED, 9, 0)); // 초기화(무장만)
        expect(notes).toHaveLength(0);
        mon.check(kst(WED, 9, 4)); // stale → 🚨
        expect(notes).toHaveLength(1);
        expect(notes[0]).toContain("🚨");
    });
});
