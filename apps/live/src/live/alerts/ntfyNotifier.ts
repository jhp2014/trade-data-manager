// 알람 전달 — ntfy(기본 공식 서버 ntfy.sh). 인증 없는 단순 HTTP POST, 토픽 = 긴 랜덤 문자열이 비밀.
// 텔레그램(뉴스와 섞여 시끄러움)에서 분리한 전용 알람 앱 채널. 우선순위(min~urgent)를 헤더로 전달
// — Android 에서 urgent 는 무음모드를 뚫고 반복음, min 은 무음 적재. 선택은 createNotifier(env).
// 노티파이어는 "텍스트 1건 전송"만 하는 트랜스포트 — 포맷·배치·재시도는 NotifyQueue 가 소유.
import type { NotifyPriority } from "./notifyQueue.js";

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

    /** 텍스트 1건 전송 — 실패는 throw(호출측 NotifyQueue 가 재시도). */
    async sendText(text: string, opts?: { priority?: NotifyPriority }): Promise<void> {
        await this.post(`${this.cfg.server}/${this.cfg.topic}`, text, opts?.priority ?? "default");
    }
}
