// 알림 전송로 선택(env) — 모듈과 수동 테스트 스크립트가 같은 로직을 쓴다.
//  LIVE_TELEGRAM_TRANSPORT=bot(기본) : Bot API — LIVE_TELEGRAM_BOT_TOKEN + LIVE_TELEGRAM_CHAT_ID.
//                                      호스팅(OCI)용 — 로컬 망은 api.telegram.org IP 차단이라 불통.
//  LIVE_TELEGRAM_TRANSPORT=user      : MTProto(내 계정) — LIVE_TELEGRAM_PEER(없으면 CHAT_ID 재사용,
//                                      같은 채널이면 값 동일). 로컬 대체 전송로. 내 폰 푸시는 안 옴.
// 설정 불충분이면 null(호출측이 "로그로만" 경고).
import type { AlertFiring } from "./types.js";
import { TelegramAlertNotifier, loadTelegramBotConfigFromEnv } from "./telegramNotifier.js";
import { MtprotoAlertNotifier } from "./mtprotoNotifier.js";

export interface AlertNotifier {
    send(firings: readonly AlertFiring[]): Promise<void>;
    close?(): Promise<void>;
}

export function createAlertNotifierFromEnv(env: NodeJS.ProcessEnv = process.env): { notifier: AlertNotifier; label: string } | null {
    const transport = (env.LIVE_TELEGRAM_TRANSPORT?.trim() || "bot").toLowerCase();
    if (transport === "user") {
        const peer = env.LIVE_TELEGRAM_PEER?.trim() || env.LIVE_TELEGRAM_CHAT_ID?.trim();
        if (!peer) return null;
        return { notifier: new MtprotoAlertNotifier(peer), label: `MTProto(내 계정) → ${peer.slice(0, 8)}…` };
    }
    const cfg = loadTelegramBotConfigFromEnv(env);
    if (!cfg) return null;
    return { notifier: new TelegramAlertNotifier(cfg), label: "Bot API" };
}
