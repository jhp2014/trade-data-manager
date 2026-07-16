// 알림 전송로 선택(env) — 모듈과 수동 테스트 스크립트가 같은 로직을 쓴다.
//  LIVE_NOTIFY_TRANSPORT=bot(기본) : 텔레그램 Bot API — LIVE_TELEGRAM_BOT_TOKEN + LIVE_TELEGRAM_CHAT_ID.
//                                    현행 전송로. HTML 서식·답장(컨텍스트 후속)·message_id 지원.
//                                    ⚠️ 로컬 망은 api.telegram.org IP 차단이라 불통 — 호스팅(iwinv)용.
//  LIVE_NOTIFY_TRANSPORT=ntfy      : ntfy(기본 ntfy.sh) — LIVE_NTFY_TOPIC(+선택 LIVE_NTFY_SERVER).
//                                    대기 자산. 평문만 되지만 urgent 가 Android 무음모드를 뚫는다.
//  LIVE_NOTIFY_TRANSPORT=user      : 텔레그램 MTProto(내 계정) — LIVE_TELEGRAM_PEER(없으면 CHAT_ID 재사용).
//                                    로컬 대체 전송로. 평문. 내 폰 푸시는 안 옴.
//  (구 LIVE_TELEGRAM_TRANSPORT 도 폴백으로 읽음 — 서버 env 하위호환)
// 설정 불충분이면 null(호출측이 "로그로만" 경고).
// 전송로 추가 = 이 파일에 분기 하나 + 어댑터 하나. 채널을 동시에 여럿 쓰게 되면 그때 fan-out 허브를
// 도입한다(지금은 노티파이어가 하나라 허브가 쓰이지 않는 코드가 된다).
import { TelegramAlertNotifier, loadTelegramBotConfigFromEnv } from "./telegramNotifier.js";
import { MtprotoAlertNotifier } from "./mtprotoNotifier.js";
import { NtfyNotifier, loadNtfyConfigFromEnv } from "./ntfyNotifier.js";
import type { NotifyMessage } from "./message.js";

/**
 * 알림 트랜스포트 — 메시지 1건 전송. 포맷·배치·재시도는 NotifyQueue 소유.
 * 반환 = 그 전송로의 message id(답장 앵커). 답장을 모르는 전송로는 null.
 */
export interface AlertNotifier {
    send(msg: NotifyMessage): Promise<number | null>;
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
