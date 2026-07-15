// 알림 전송로 선택(env) — 모듈과 수동 테스트 스크립트가 같은 로직을 쓴다.
//  LIVE_NOTIFY_TRANSPORT=ntfy      : ntfy(기본 ntfy.sh) — LIVE_NTFY_TOPIC(+선택 LIVE_NTFY_SERVER).
//                                    전용 알람 앱(텔레그램 뉴스와 분리) + 우선순위(urgent=무음 뚫기).
//  LIVE_NOTIFY_TRANSPORT=bot(기본) : 텔레그램 Bot API — LIVE_TELEGRAM_BOT_TOKEN + LIVE_TELEGRAM_CHAT_ID.
//                                    호스팅용 — 로컬 망은 api.telegram.org IP 차단이라 불통.
//  LIVE_NOTIFY_TRANSPORT=user      : 텔레그램 MTProto(내 계정) — LIVE_TELEGRAM_PEER(없으면 CHAT_ID 재사용).
//                                    로컬 대체 전송로. 내 폰 푸시는 안 옴.
//  (구 LIVE_TELEGRAM_TRANSPORT 도 폴백으로 읽음 — 서버 env 하위호환)
// 설정 불충분이면 null(호출측이 "로그로만" 경고).
import { TelegramAlertNotifier, loadTelegramBotConfigFromEnv } from "./telegramNotifier.js";
import { MtprotoAlertNotifier } from "./mtprotoNotifier.js";
import { NtfyNotifier, loadNtfyConfigFromEnv } from "./ntfyNotifier.js";
import type { NotifyPriority } from "./notifyQueue.js";

/** 알림 트랜스포트 — 텍스트 1건 전송(+우선순위, 지원 전송로만). 포맷·배치·재시도는 NotifyQueue 소유. */
export interface AlertNotifier {
    sendText(text: string, opts?: { priority?: NotifyPriority }): Promise<void>;
    close?(): Promise<void>;
}

export function createAlertNotifierFromEnv(env: NodeJS.ProcessEnv = process.env): { notifier: AlertNotifier; label: string } | null {
    const transport = (env.LIVE_NOTIFY_TRANSPORT?.trim() || env.LIVE_TELEGRAM_TRANSPORT?.trim() || "bot").toLowerCase();
    if (transport === "ntfy") {
        const cfg = loadNtfyConfigFromEnv(env);
        if (!cfg) return null;
        return { notifier: new NtfyNotifier(cfg), label: `ntfy → ${cfg.server}/${cfg.topic.slice(0, 10)}…` };
    }
    if (transport === "user") {
        const peer = env.LIVE_TELEGRAM_PEER?.trim() || env.LIVE_TELEGRAM_CHAT_ID?.trim();
        if (!peer) return null;
        return { notifier: new MtprotoAlertNotifier(peer), label: `MTProto(내 계정) → ${peer.slice(0, 8)}…` };
    }
    const cfg = loadTelegramBotConfigFromEnv(env);
    if (!cfg) return null;
    return { notifier: new TelegramAlertNotifier(cfg), label: "Bot API" };
}
