// 알람 전달 — MTProto(내 계정, infra/telegram 세션 자급). Bot API 가 IP 차단인 로컬 망의 대체 전송로.
// lazy 접속(첫 전송에서만, apps/api LazyTelegramNewsSearcher 와 같은 관례) — 세션 미설정이어도 앱은 뜬다.
// ⚠️ 내 계정 발신이라 내 폰엔 푸시가 안 온다(자기 메시지 알림 제외) — 채널 기록·타 구독자 알림용.
// 노티파이어는 "메시지 1건 전송"만 하는 트랜스포트 — 포맷·배치·재시도는 NotifyQueue 가 소유.
// 서식·답장 미지원 전송로 → 평문 폴백(plainText) + replyTo 무시 + message_id 없음(null).
import { createTelegram, type Telegram } from "@trade-data-manager/telegram";
import { plainText, type NotifyMessage } from "./message.js";

export class MtprotoAlertNotifier {
    private tg: Telegram | null = null;
    private connecting: Promise<Telegram> | null = null;
    private closed = false;

    /** @param peer 게시할 방 — @유저명 또는 -100 채널 id(문자열). */
    constructor(private readonly peer: string) {}

    private ensure(): Promise<Telegram> {
        if (this.closed) return Promise.reject(new Error("notifier 가 이미 종료됨"));
        if (this.tg) return Promise.resolve(this.tg);
        if (!this.connecting) {
            this.connecting = createTelegram()
                .then((tg) => {
                    this.tg = tg;
                    return tg;
                })
                .catch((err: unknown) => {
                    this.connecting = null; // 실패 시 다음 전송에서 재시도
                    throw err;
                });
        }
        return this.connecting;
    }

    /** 메시지 1건 전송(평문) — 실패는 throw(호출측 NotifyQueue 가 재시도). 답장 앵커 없음(null). */
    async send(msg: NotifyMessage): Promise<number | null> {
        const tg = await this.ensure();
        await tg.sendMessage(this.peer, plainText(msg));
        return null;
    }

    /** 접속 정리 — 모듈 종료 시. 접속 진행 중이면 완료를 기다렸다 끊는다(누수 방지). */
    async close(): Promise<void> {
        this.closed = true;
        if (this.connecting) await this.connecting.catch(() => {});
        const tg = this.tg;
        this.tg = null;
        this.connecting = null;
        if (tg) await tg.disconnect();
    }
}
