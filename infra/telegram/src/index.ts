// @trade-data-manager/telegram — Telegram(MTProto/GramJS) 공통 레이어.
// 세션으로 무인 접속해 "방 안 키워드 검색"·"방에 게시" 를 제공한다. 상주 연결의 신뢰성(재접속)은
// resilient.ts 가 요청 단위로 자가치유한다. kis/kiwoom 어댑터와 같은 관례: 자급자족 .env, recon 실측.

export {
    type TelegramConfig,
    loadTelegramConfigFromEnv,
    ensureTelegramEnvLoaded,
} from "./config.js";
export {
    type Telegram,
    type TelegramMessage,
    type TelegramWebpage,
    type TelegramSearchOptions,
} from "./types.js";
export { createTelegram } from "./client.js";
export { type TelegramChannel, NEWS_CHANNELS } from "./channels.js";
