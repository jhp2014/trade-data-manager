import fs from "fs";
import path from "path";
import axios from "axios";
import { kiwoomConfig } from "./config.js";
import { KiwoomTokenResponse } from "./types.js";
import { KiwoomRequest } from "./decorators.js";

class TokenManager {
    private token: string | null = null;
    private expiresDt: string | null = null;

    async getValidToken(): Promise<string> {
        if (this.token && this.expiresDt && this.isTokenValid(this.expiresDt)) {
            return this.token;
        }

        const cached = this.loadFromCache();
        if (cached && this.isTokenValid(cached.expires_dt)) {
            this.token = cached.access_token;
            this.expiresDt = cached.expires_dt;
            return this.token!;
        }

        return await this.refreshParams();
    }

    @KiwoomRequest("Auth-Token")
    private async refreshParams(): Promise<string> {
        const response = await axios.post<KiwoomTokenResponse>(
            `${kiwoomConfig.baseUrl}/oauth2/token`,
            {
                grant_type: "client_credentials",
                appkey: kiwoomConfig.appKey,
                secretkey: kiwoomConfig.secretKey,
            }
        );

        const data = response.data;

        if (data.return_code !== 0) {
            throw new Error(`키움 API 인증 거부: ${data.return_msg}`);
        }

        this.token = data.token;
        this.expiresDt = data.expires_dt;

        this.saveToCache(this.token, this.expiresDt);
        return this.token;
    }

    private isTokenValid(expiresDt: string): boolean {
        if (!expiresDt || expiresDt.length !== 14) return false;
        const expireTime = this.parseKiwoomDate(expiresDt).getTime();
        return expireTime > Date.now() + 5 * 60 * 1000; // 5분 여유
    }

    private parseKiwoomDate(dt: string): Date {
        return new Date(
            parseInt(dt.substring(0, 4)),
            parseInt(dt.substring(4, 6)) - 1,
            parseInt(dt.substring(6, 8)),
            parseInt(dt.substring(8, 10)),
            parseInt(dt.substring(10, 12)),
            parseInt(dt.substring(12, 14))
        );
    }

    private loadFromCache() {
        const cachePath = path.resolve(process.cwd(), kiwoomConfig.tokenCachePath);
        if (!fs.existsSync(cachePath)) return null;
        return JSON.parse(fs.readFileSync(cachePath, "utf8"));
    }

    private saveToCache(token: string, expiresDt: string) {
        const cachePath = path.resolve(process.cwd(), kiwoomConfig.tokenCachePath);
        const cacheDir = path.dirname(cachePath);
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ access_token: token, expires_dt: expiresDt }));
    }
}

export const tokenManager = new TokenManager();