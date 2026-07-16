// 알람 전달 — 텔레그램 Bot API(sendMessage). 봇 토큰 하나의 단순 HTTP(세션·FLOOD 리스크 없음).
// ⚠️ 로컬 망(KT 추정)이 api.telegram.org IP 대역을 차단해 로컬에선 불통 — 호스팅(iwinv) 전용 전송로.
//    로컬은 mtprotoNotifier(내 계정 MTProto, 오픈 대역 DC)가 대체. 선택은 createNotifier(env).
// 이 어댑터가 소유하는 것(전송로 관심사):
//  · **HTML 이스케이프** — 뉴스 제목의 `<`·`&` 가 parse_mode 파싱 에러(400)로 알람을 통째로 죽이지 않게.
//  · **4096자 분할** — 블록 경계로 쪼갠다(태그 중간에서 자르면 파싱 에러). 뒷조각은 첫 조각에 답장으로 묶음.
//  · **message_id 반환** — 컨텍스트 후속(테마·뉴스)이 이 id 에 답장으로 붙는 앵커.
import type { MessageBlock, NotifyMessage } from "./message.js";

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

const LIMIT = 4096; // Bot API sendMessage 본문 상한

/** 텔레그램 HTML 본문 이스케이프 — 이 셋만 요구한다(공식 문서). */
function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** href 속성값 — 본문 이스케이프 + 따옴표. */
function escAttr(s: string): string {
    return esc(s).replace(/"/g, "&quot;");
}

/** 블록 1개 → 태그가 닫힌 self-contained HTML 조각. */
function renderBlock(b: MessageBlock): string {
    switch (b.kind) {
        case "text":
            return b.bold ? `<b>${esc(b.text)}</b>` : esc(b.text);
        case "pre":
            return `<pre>${esc(b.text)}</pre>`;
        case "link":
            return `<a href="${escAttr(b.url)}">${esc(b.text)}</a>`;
    }
}

/** 한 줄이 통째로 한도를 넘으면 렌더 결과가 들어갈 때까지 raw 를 줄인다(이스케이프 팽창까지 흡수). */
function fitLine(line: string, wrap: (lines: string[]) => string): string {
    let s = line;
    while (s.length > 1 && wrap([s]).length > LIMIT) s = s.slice(0, Math.floor(s.length * 0.8));
    return s === line ? line : `${s}…`;
}

/** 블록 1개 → 각각 한도 이하인 HTML 조각들(줄 경계로 쪼개고 조각마다 태그를 다시 감싼다). */
function splitBlock(b: MessageBlock): string[] {
    const whole = renderBlock(b);
    if (whole.length <= LIMIT) return [whole];
    // 링크는 쪼갤 수 없다 — 표시 텍스트만 줄여 살린다(URL 보존).
    if (b.kind === "link") return [renderBlock({ ...b, text: `${b.text.slice(0, 200)}…` })];

    const wrap = (lines: string[]): string => renderBlock({ ...b, text: lines.join("\n") });
    const out: string[] = [];
    let buf: string[] = [];
    const flush = (): void => {
        if (buf.length) {
            out.push(wrap(buf));
            buf = [];
        }
    };
    for (const raw of b.text.split("\n")) {
        const line = fitLine(raw, wrap);
        if (buf.length && wrap([...buf, line]).length > LIMIT) flush();
        buf.push(line);
    }
    flush();
    return out;
}

/** 메시지 → 전송할 HTML 조각들(각각 ≤4096, 태그 균형 보장). 빈 메시지면 빈 배열. */
export function renderTelegramHtml(msg: NotifyMessage): string[] {
    const parts = msg.blocks.flatMap(splitBlock).filter((p) => p.length > 0);
    const chunks: string[] = [];
    let cur = "";
    for (const p of parts) {
        const next = cur ? `${cur}\n${p}` : p;
        if (next.length > LIMIT) {
            if (cur) chunks.push(cur);
            cur = p;
        } else {
            cur = next;
        }
    }
    if (cur) chunks.push(cur);
    return chunks;
}

/** 전송 함수 주입점(테스트 스텁) — 기본은 fetch POST. 반환 = message_id(답장 앵커). */
export type SendMessageFn = (botToken: string, chatId: string, html: string, replyTo?: number) => Promise<number | null>;

const fetchSend: SendMessageFn = async (botToken, chatId, html, replyTo) => {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: html,
            parse_mode: "HTML",
            disable_web_page_preview: true, // 뉴스 링크 여러 건에 프리뷰가 붙으면 메시지가 비대해진다
            ...(replyTo != null ? { reply_to_message_id: replyTo } : {}),
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`텔레그램 sendMessage ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json().catch(() => null)) as { result?: { message_id?: number } } | null;
    return json?.result?.message_id ?? null;
};

export class TelegramAlertNotifier {
    constructor(
        private readonly cfg: TelegramBotConfig,
        private readonly sendMessage: SendMessageFn = fetchSend,
    ) {}

    /**
     * 메시지 1건 전송(길면 여러 조각) → 첫 조각의 message_id(컨텍스트 후속의 답장 앵커).
     * 실패는 throw(호출측 NotifyQueue 가 재시도).
     */
    async send(msg: NotifyMessage): Promise<number | null> {
        let first: number | null = null;
        let replyTo = msg.replyTo;
        for (const html of renderTelegramHtml(msg)) {
            const id = await this.sendMessage(this.cfg.botToken, this.cfg.chatId, html, replyTo);
            if (first == null) {
                first = id;
                // 분할 뒷조각은 첫 조각에 답장으로 붙여 순서·묶음을 보장(원래 replyTo 가 있으면 그대로 둔다).
                if (replyTo == null && id != null) replyTo = id;
            }
        }
        return first;
    }
}
