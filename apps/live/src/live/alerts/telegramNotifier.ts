// 알람 전달 — 텔레그램 Bot API(sendMessage). MTProto(개인 세션, 검색용 infra/telegram)와 완전 분리:
// 전송은 봇 토큰 하나의 단순 HTTP 라 세션·FLOOD 리스크가 없다(설계 결정).
// 종목당 1메시지: 같은 발화 배치(한 틱)에서 같은 종목의 룰 여러 개는 한 메시지로 묶는다.
import type { AlertFiring } from "./types.js";
import { formatFiring } from "./format.js";

export interface TelegramBotConfig {
    botToken: string;
    chatId: string;
}

/** LIVE_TELEGRAM_BOT_TOKEN / LIVE_TELEGRAM_CHAT_ID — 둘 다 있어야 활성(아니면 null → 로그로만 degrade). */
export function loadTelegramBotConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TelegramBotConfig | null {
    const botToken = env.LIVE_TELEGRAM_BOT_TOKEN?.trim();
    const chatId = env.LIVE_TELEGRAM_CHAT_ID?.trim();
    return botToken && chatId ? { botToken, chatId } : null;
}

/** 전송 함수 주입점(테스트 스텁) — 기본은 fetch POST. ok 아니면 본문을 실어 throw. */
export type SendMessageFn = (botToken: string, chatId: string, text: string) => Promise<void>;

const fetchSend: SendMessageFn = async (botToken, chatId, text) => {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`텔레그램 sendMessage ${res.status}: ${body.slice(0, 200)}`);
    }
};

export class TelegramAlertNotifier {
    constructor(
        private readonly cfg: TelegramBotConfig,
        private readonly sendMessage: SendMessageFn = fetchSend,
    ) {}

    /** 한 배치(한 틱) 발화 전송 — 종목별 1메시지. 실패는 throw(호출측 sink 가 로그). */
    async send(firings: readonly AlertFiring[]): Promise<void> {
        const byCode = new Map<string, AlertFiring[]>();
        for (const f of firings) {
            const list = byCode.get(f.code);
            if (list) list.push(f);
            else byCode.set(f.code, [f]);
        }
        for (const group of byCode.values()) {
            const text = `🔔 ${group.map(formatFiring).join("\n")}`;
            await this.sendMessage(this.cfg.botToken, this.cfg.chatId, text);
        }
    }
}
