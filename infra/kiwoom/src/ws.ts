// '@trade-data-manager/kiwoom/ws' — WebSocket 진입점.
// REST 전용 소비자(배치/파이프라인)가 'ws' 패키지 의존성을 끌어오지 않도록 메인 index 와 분리.
export { KiwoomWs, type KiwoomWsOptions, type ConnectionStatus } from "./ws/client.js";
export {
    type FrameLogger,
    type FrameDir,
    noopFrameLogger,
    createFileFrameLogger,
} from "./ws/frameLogger.js";

import type { Kiwoom } from "./index.js";
import { KiwoomWs } from "./ws/client.js";
import type { FrameLogger } from "./ws/frameLogger.js";
import { KiwoomError } from "./errors.js";

/** Kiwoom 핸들로부터 WS 를 만든다. primary 자격증명의 토큰을 사용. */
export function createKiwoomWs(kiwoom: Kiwoom, opts: { logFrame?: FrameLogger } = {}): KiwoomWs {
    const wsUrl = kiwoom.config.wsUrl;
    if (!wsUrl) {
        throw new KiwoomError("KIWOOM_WS_URL 이 설정되지 않아 WS 를 만들 수 없습니다");
    }
    return new KiwoomWs({
        wsUrl,
        getToken: (force) => kiwoom.pool.primaryToken(force),
        logFrame: opts.logFrame,
    });
}
