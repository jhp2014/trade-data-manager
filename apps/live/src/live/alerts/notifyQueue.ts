// 알림 재시도 큐 — framework-free. 메시지를 쌓고 트랜스포트(send) 실패 시 백오프 재시도.
// 설계([[alert-conditions-dnf-redesign]] 신뢰 축):
//  · 실패는 트랜스포트 공통 원인(네트워크·429·토큰) → 백오프는 **큐 단위**(항목별 아님): 연속실패 n회째
//    5s→30s→2m→5m 뒤에 재개. 성공하면 리셋. (전송로를 동시에 여럿 쓰게 되면 이 전제가 깨지므로
//    그때는 큐를 전송로마다 하나씩 둔다 — 지금은 하나라 큐도 하나.)
//  · TTL 10분 — 가격 알람은 시효가 짧다. 초과 항목은 폐기(카운트만 남김, 외부 데드맨·요약이 노출).
//  · **지연 표기(⏰)는 배달 시점에 붙인다** — 적재 시점엔 지연 여부를 알 수 없다.
//  · 메모리 전용(프로세스 재시작 시 유실 수용 — 시효 짧은 알람 특성상 영속보다 단순함이 이득).
// 쿨다운은 여기 없다 — 발화 억제가 아니라 **배달 억제**라 NotifyGate 가 큐 앞단에서 소유한다
// (억제된 발화도 워크벤치 로그엔 남아야 하므로).
// 시계는 tick(now) 주입 — 테스트는 가짜 시각으로 구동, 런타임은 인터벌이 Date.now() 로 호출.
import { plainText, textMessage, type NotifyMessage, type NotifyPriority } from "./message.js";
import { kstTime } from "./format.js";

const TTL_MS = 10 * 60_000; // 이보다 늦으면 폐기(소음 방지)
const BACKOFF_MS = [5_000, 30_000, 120_000, 300_000]; // 연속실패 1·2·3·4회+ 후 대기
const DELAY_MARK_MS = 30_000; // 이보다 늦게 배달되면 원발화 시각 표기(수신시각 오독 방지)

interface Entry {
    msg: NotifyMessage;
    firstAt: number;
}

export interface NotifyTransport {
    send(msg: NotifyMessage): Promise<number | null>;
}

export interface QueueStats {
    pending: number;
    consecutiveFailures: number;
    lastOkAt: number | null;
    lastFailAt: number | null;
    enqueuedFirings: number; // 누적 발화 메시지 수(종목 단위 — 요약용)
    droppedEntries: number; // TTL 폐기 누적(요약·데드맨용)
}

/** 배달이 30초+ 늦으면 원발화 시각을 덧붙인다(발화 메시지만 — 시각 오독이 문제되는 건 시세 알람). */
function withDelayMark(msg: NotifyMessage, firstAt: number, now: number): NotifyMessage {
    if (msg.kind !== "firing" || now - firstAt <= DELAY_MARK_MS) return msg;
    return { ...msg, blocks: [...msg.blocks, { kind: "text", text: `⏰ ${kstTime(firstAt)} 발화(지연 전송)` }] };
}

export class NotifyQueue {
    private readonly q: Entry[] = [];
    private consecutiveFailures = 0;
    private retryAt = 0; // 이 시각 전엔 전송 보류(큐 단위 백오프)
    private lastOkAt: number | null = null;
    private lastFailAt: number | null = null;
    private enqueuedFirings = 0;
    private droppedEntries = 0;
    private sending = false; // tick 재진입 방지(전송 in-flight 중 다음 tick)

    constructor(
        private readonly transport: NotifyTransport | null, // null = 전송로 미설정(로그 전용 — 큐는 즉시 소화)
        private readonly onDrop: (entry: { firstAt: number; summary: string }) => void = () => {},
        private readonly onSendError: (err: unknown) => void = () => {},
    ) {}

    /** 메시지 1건 적재. 발화(firing)는 요약 카운트에 잡힌다. */
    push(msg: NotifyMessage, now: number): void {
        if (msg.kind === "firing") this.enqueuedFirings++;
        this.q.push({ msg, firstAt: now });
    }

    /** 단순 문구 1건 적재(헬스·하트비트·장마감 요약) — 우선순위는 호출자가 지정. */
    pushText(text: string, now: number, priority: NotifyPriority = "default"): void {
        this.q.push({ msg: textMessage(text, priority), firstAt: now });
    }

    /** 한 사이클 — TTL 폐기 → (백오프 창 밖이면) 오래된 것부터 순차 전송. 실패 시 큐 백오프 걸고 중단. */
    async tick(now: number): Promise<void> {
        // TTL 폐기(전송로 유무와 무관 — 죽은 알람이 살아나 소음 되지 않게)
        for (let i = this.q.length - 1; i >= 0; i--) {
            const e = this.q[i];
            if (now - e.firstAt > TTL_MS) {
                this.q.splice(i, 1);
                this.droppedEntries++;
                this.onDrop({ firstAt: e.firstAt, summary: plainText(e.msg).slice(0, 60) });
            }
        }
        if (this.q.length === 0 || this.sending || now < this.retryAt) return;
        if (!this.transport) {
            this.q.length = 0; // 전송로 없음 — 발화 로그는 sink 가 이미 남김. 큐만 비움.
            return;
        }
        this.sending = true;
        try {
            while (this.q.length > 0) {
                const e = this.q[0];
                await this.transport.send(withDelayMark(e.msg, e.firstAt, now));
                this.q.shift();
                this.consecutiveFailures = 0;
                this.lastOkAt = now;
            }
        } catch (err) {
            this.consecutiveFailures++;
            this.lastFailAt = now;
            this.retryAt = now + BACKOFF_MS[Math.min(this.consecutiveFailures - 1, BACKOFF_MS.length - 1)];
            this.onSendError(err);
        } finally {
            this.sending = false;
        }
    }

    stats(): QueueStats {
        return {
            pending: this.q.length,
            consecutiveFailures: this.consecutiveFailures,
            lastOkAt: this.lastOkAt,
            lastFailAt: this.lastFailAt,
            enqueuedFirings: this.enqueuedFirings,
            droppedEntries: this.droppedEntries,
        };
    }
}
