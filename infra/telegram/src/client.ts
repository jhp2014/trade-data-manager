// infra/telegram — GramJS(MTProto) 운영 클라이언트 조립. 포트는 모른다(broker 어댑터가 도메인 매핑).
// 세션(.env TELEGRAM_SESSION)으로 무인 접속해 "방 안 키워드 검색"·"방에 게시" 를 제공한다.
// 상주 연결이 절전/네트워크로 stale 되는 문제는 makeResilient 가 요청 단위로 자가치유한다(resilient.ts).
import { ensureTelegramEnvLoaded, loadTelegramConfigFromEnv } from "./config.js";
import { openRawTelegram } from "./rawClient.js";
import { makeResilient, type Timeouts } from "./resilient.js";
import type { Telegram } from "./types.js";

const DEFAULT_TIMEOUTS: Timeouts = {
    connectTimeoutMs: 20_000,
    // searchChannel 은 한 peer·한 창이지만 iterMessages 가 여러 페이지 왕복이라 넉넉히.
    opTimeoutMs: 30_000,
};

/**
 * 세션으로 접속된 자가치유 클라이언트를 만든다. 세션 없거나 무효면 여기서(최초 접속) 명확히 실패한다
 * — 소비자(LazyTelegramNewsSearcher)가 이 거절을 보고 다음 요청에서 재시도할 수 있게 계약을 보존.
 */
export async function createTelegram(overrides?: Partial<Timeouts>): Promise<Telegram> {
    ensureTelegramEnvLoaded();
    const cfg = loadTelegramConfigFromEnv();
    const timeouts = { ...DEFAULT_TIMEOUTS, ...overrides };

    const tg = makeResilient(() => openRawTelegram(cfg, timeouts), timeouts);
    await tg.ensureConnected(); // eager: 무효 세션을 지금 표면화(옛 createTelegram 계약과 동일)
    return tg;
}
