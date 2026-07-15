// 헬스 모니터 — framework-free 상태기계. "알람이 죽으면 그것도 알람으로"의 서버 내부 축.
// 감시값: 마지막 성공 틱 age(인증·스캔·폴 실패를 전부 커버) · WS live age · 전송 연속실패.
// 의미론(알람 엔진과 동일 철학):
//  · 엣지 발화: 정상→이상 전이에 🚨 1회, 이상→정상에 ✅ 1회. 부팅 첫 판정은 초기화(무장만).
//  · 알림 창(평일 KST, 기본 08:00-15:40)에서만 이상/회복 알림 — 키움 심야 점검(WS 끊김 일상)에 안 울리게.
//  · 아침 하트비트: 창 시작(또는 창 중 부팅) 시 하루 1건 "✅ 정상 — 조건 N개"(이상이면 🚨 상태 보고).
//  · 장마감 요약: 창 종료 시 하루 1건 "📊 발화 M건 · 전송실패 폐기 K건".
//  · 외부 데드맨 핑 게이트: 창 안=완전 건강할 때만 true(핑 부재→healthchecks 알림, 텔레그램 죽음도 부재로 감지),
//    창 밖=프로세스 생존이면 true(심야 점검 오탐 방지).
// 시계는 check(now) 주입 — 런타임은 인터벌이 Date.now() 로 호출, 테스트는 가짜 시각.
import type { NotifyPriority, QueueStats } from "../alerts/notifyQueue.js";
import { kstTime } from "../alerts/format.js";

const TICK_STALE_MS = 180_000; // 틱 3분 중단 = 이상(폴 주기 5초 대비 넉넉)
const WS_STALE_MS = 180_000; // WS 비-live 3분 = 이상(재연결 백오프 여유)
const QUEUE_FAIL_UNHEALTHY = 4; // 전송 연속실패 4회+(백오프 누적 ≈ 2.5분+) = 전송로 이상

export interface HealthDeps {
    lastTickAt(): number | null;
    wsStatus(): string; // "live" 외 = 끊김/재연결 중
    queueStats(): QueueStats;
    ruleCount(): number; // 하트비트 표시용
    /** 알림 적재(NotifyQueue.pushText) — priority: 🚨=urgent(무음 뚫기) / 회복=default / 하트비트·요약=min(무음). */
    notify(text: string, now: number, priority: NotifyPriority): void;
}

export interface HealthConfig {
    windowStartMin: number; // KST 분(0~1439)
    windowEndMin: number;
    heartbeat: boolean; // 아침 하트비트·장마감 요약 on/off
}

/** "08:00-15:40" → 분 창. 형식 오류면 null(호출측이 기본값). */
export function parseWindow(s: string | undefined): { start: number; end: number } | null {
    const m = s?.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    return start < end ? { start, end } : null;
}

/** KST 파츠 — 한국은 DST 없음이라 고정 +9h 시프트로 충분. */
function kstParts(now: number): { ymd: string; dow: number; minutes: number } {
    const k = new Date(now + 9 * 3_600_000);
    return { ymd: k.toISOString().slice(0, 10), dow: k.getUTCDay(), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

export interface HealthSnapshot {
    healthy: boolean;
    reasons: string[];
    tickAgeSec: number | null;
    ws: string;
    queue: QueueStats;
}

export class HealthMonitor {
    private lastWsLiveAt: number | null = null;
    private prevHealthy: boolean | null = null; // null = 부팅 후 첫 판정 전(초기화)
    private heartbeatDay: string | null = null;
    private summaryDay: string | null = null;
    private openStats: { day: string; enqueued: number; dropped: number } | null = null;

    constructor(
        private readonly deps: HealthDeps,
        private readonly cfg: HealthConfig,
    ) {}

    /** 현재 건강 판정 + 사유. */
    evaluate(now: number): HealthSnapshot {
        if (this.deps.wsStatus() === "live") this.lastWsLiveAt = now;
        const reasons: string[] = [];
        const tickAt = this.deps.lastTickAt();
        if (tickAt == null || now - tickAt > TICK_STALE_MS) {
            reasons.push(tickAt == null ? "엔진 틱 없음(시작 실패?)" : `엔진 틱 ${Math.round((now - tickAt) / 60_000)}분 중단(마지막 ${kstTime(tickAt)})`);
        }
        if (this.lastWsLiveAt == null || now - this.lastWsLiveAt > WS_STALE_MS) {
            reasons.push(`WS 연결 끊김(${this.deps.wsStatus()})`);
        }
        const q = this.deps.queueStats();
        if (q.consecutiveFailures >= QUEUE_FAIL_UNHEALTHY) {
            reasons.push(`텔레그램 전송 연속 실패 ${q.consecutiveFailures}회(대기 ${q.pending}건)`);
        }
        return { healthy: reasons.length === 0, reasons, tickAgeSec: tickAt == null ? null : Math.round((now - tickAt) / 1000), ws: this.deps.wsStatus(), queue: q };
    }

    /** 외부 데드맨 핑 게이트 — 창 안=완전 건강만 / 창 밖=생존만(true). */
    shouldPing(now: number): boolean {
        const { dow, minutes } = kstParts(now);
        const inWindow = dow >= 1 && dow <= 5 && minutes >= this.cfg.windowStartMin && minutes < this.cfg.windowEndMin;
        return inWindow ? this.evaluate(now).healthy : true;
    }

    /** 주기 판정(런타임 인터벌·테스트 공용) — 하트비트/엣지 알림/장마감 요약을 deps.notify 로 적재. */
    check(now: number): void {
        const snap = this.evaluate(now);
        const { ymd, dow, minutes } = kstParts(now);
        const weekday = dow >= 1 && dow <= 5;
        const inWindow = weekday && minutes >= this.cfg.windowStartMin && minutes < this.cfg.windowEndMin;

        if (inWindow) {
            // 아침 하트비트(창 중 부팅 포함 하루 1건) — 현재 상태 보고 + 이후 엣지 기준선.
            if (this.cfg.heartbeat && this.heartbeatDay !== ymd) {
                this.heartbeatDay = ymd;
                const q = this.deps.queueStats();
                this.openStats = { day: ymd, enqueued: q.enqueuedFirings, dropped: q.droppedEntries };
                this.deps.notify(
                    snap.healthy
                        ? `✅ 알람 시스템 정상 — 조건 ${this.deps.ruleCount()}개 감시 중`
                        : `🚨 장 시작 — 알람 시스템 이상\n${snap.reasons.join("\n")}`,
                    now,
                    snap.healthy ? "min" : "urgent",
                );
                this.prevHealthy = snap.healthy;
                return;
            }
            // 엣지 알림 — 부팅 첫 판정은 무장만.
            if (this.prevHealthy == null) {
                this.prevHealthy = snap.healthy;
            } else if (this.prevHealthy && !snap.healthy) {
                this.deps.notify(`🚨 알람 시스템 이상 — 발화가 누락될 수 있음\n${snap.reasons.join("\n")}`, now, "urgent");
                this.prevHealthy = false;
            } else if (!this.prevHealthy && snap.healthy) {
                this.deps.notify("✅ 알람 시스템 회복 — 감시 재개", now, "default");
                this.prevHealthy = true;
            }
            return;
        }

        // 창 밖 — 알림 없이 기준선만 갱신(창 진입 시 하트비트가 상태를 보고).
        this.prevHealthy = snap.healthy;

        // 장마감 요약 — 창 종료 후 하루 1건(그날 창을 지났을 때만).
        if (this.cfg.heartbeat && weekday && minutes >= this.cfg.windowEndMin && this.summaryDay !== ymd && this.openStats?.day === ymd) {
            this.summaryDay = ymd;
            const q = this.deps.queueStats();
            const fired = q.enqueuedFirings - this.openStats.enqueued;
            const dropped = q.droppedEntries - this.openStats.dropped;
            this.deps.notify(`📊 장마감 — 알람 ${fired}건 발화${dropped > 0 ? ` · 전송실패 폐기 ${dropped}건` : ""}`, now, "min");
        }
    }
}
