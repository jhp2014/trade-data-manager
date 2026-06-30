// @trade-data-manager/telegram — Telegram(MTProto/GramJS) 공통 레이어.
// 현재는 recon(정찰) 단계 — 내 계정 로그인·방 목록·방내 검색 실측까지만.
// 이후 NewsSearchPort 어댑터(방 단위 messages.search)와 수동저장이 여기 붙는다.
// kis/kiwoom 어댑터와 같은 관례: 자급자족 .env, recon raw 사이드카, 문서 말고 실측.

export {
    type TelegramConfig,
    loadTelegramConfigFromEnv,
    ensureTelegramEnvLoaded,
} from "./config.js";
export {
    type Telegram,
    type TelegramMessage,
    type TelegramSearchOptions,
    createTelegram,
} from "./client.js";
export { type TelegramChannel, NEWS_CHANNELS } from "./channels.js";
