// 알람 전달 — ntfy(기본 공식 서버 ntfy.sh). 인증 없는 단순 HTTP POST, 토픽 = 긴 랜덤 문자열이 비밀.
// 우선순위(min~urgent)를 헤더로 전달 — Android 에서 urgent 는 무음모드를 뚫고 반복음, min 은 무음 적재.
// 지금 기본 전송로는 텔레그램(LIVE_NOTIFY_TRANSPORT=bot)이고 이 어댑터는 대기 자산 —
// "무음 뚫기가 필요하다" 싶으면 env 한 줄로 되살아난다. 선택은 createNotifier(env).
// 서식·답장 미지원 전송로 → 평문 폴백(plainText) + replyTo 무시 + message_id 없음(null).
import { plainText, type NotifyMessage } from "./message.js";
import type { NotifyPriority } from "./message.js";

export interface NtfyConfig {
    server: string; // 기본 https://ntfy.sh
    topic: string; // 긴 랜덤 토픽(비밀) — 앱에서 이 토픽 구독
}

/** LIVE_NTFY_TOPIC(필수) / LIVE_NTFY_SERVER(선택, 기본 ntfy.sh). 토픽 없으면 null(로그로만 degrade). */
export function loadNtfyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NtfyConfig | null {
    const topic = env.LIVE_NTFY_TOPIC?.trim();
    if (!topic) return null;
    return { server: env.LIVE_NTFY_SERVER?.trim() || "https://ntfy.sh", topic };
}

/** 전송 함수 주입점(테스트 스텁) — 기본은 fetch POST. ok 아니면 본문을 실어 throw(404 조용한 실패 방지). */
export type NtfyPostFn = (url: string, text: string, priority: NotifyPriority) => Promise<void>;

const fetchPost: NtfyPostFn = async (url, text, priority) => {
    const res = await fetch(url, {
        method: "POST",
        body: text,
        // Title 헤더는 latin-1 제약이라 생략(한글 불가) — 앱 표시는 토픽명 + 본문 이모지로 충분.
        headers: { Priority: priority, "Content-Type": "text/plain; charset=utf-8" },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ntfy POST ${res.status}: ${body.slice(0, 200)}`);
    }
};

export class NtfyNotifier {
    constructor(
        private readonly cfg: NtfyConfig,
        private readonly post: NtfyPostFn = fetchPost,
    ) {}

    /** 메시지 1건 전송(평문) — 실패는 throw(호출측 NotifyQueue 가 재시도). 답장 앵커 없음(null). */
    async send(msg: NotifyMessage): Promise<number | null> {
        await this.post(`${this.cfg.server}/${this.cfg.topic}`, plainText(msg), msg.priority);
        return null;
    }
}
