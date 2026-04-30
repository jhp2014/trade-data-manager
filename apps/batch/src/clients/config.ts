// src/clients/kiwoom/config.ts
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
    KIWOOM_APP_KEY: z.string(),
    KIWOOM_SECRET_KEY: z.string(),
    KIWOOM_BASE_URL: z.string().url(),
});

const env = envSchema.parse(process.env);

export const kiwoomConfig = {
    appKey: env.KIWOOM_APP_KEY,
    secretKey: env.KIWOOM_SECRET_KEY,
    baseUrl: env.KIWOOM_BASE_URL,
    rateLimitMs: 100,
    tokenCachePath: ".cache/kiwoom_token.json",
};

// 필수 값 검증
if (!kiwoomConfig.appKey || !kiwoomConfig.secretKey || !kiwoomConfig.baseUrl) {
    throw new Error("Kiwoom API Credentials or BaseURL is missing in .env");
}