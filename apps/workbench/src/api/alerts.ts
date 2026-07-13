// watchlist·알람룰 클라이언트 — apps/live(/live 프록시 → :3002) REST. 계약은 contracts/wire(alerts.ts).
import type { AlertRule, WatchlistView } from "@trade-data-manager/wire";

export type { AlertRule, AlertRuleView, AlertFiring, WatchlistView, BandCondition, RankCondition } from "@trade-data-manager/wire";

/** POST /live/alerts 요청 몸체 — baseline 은 서버(현재 시세)가 우선, 없을 때 폴백. */
export interface CreateRulePayload {
    code: string;
    band?: { lowerPct: number | null; upperPct: number | null };
    rank?: { theme: string; mode: "reach" | "delta"; threshold: number };
    cooldownMs?: number;
    note?: string;
    baseline?: number;
}

async function liveRequest<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`/live/${path}`, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        let msg = text;
        try {
            msg = String((JSON.parse(text) as { message?: unknown }).message ?? text); // Nest 에러 봉투에서 메시지만
        } catch {
            /* JSON 아니면 원문 그대로 */
        }
        throw new Error(msg || `${method} /live/${path} ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
}

export const fetchWatchlist = (signal?: AbortSignal): Promise<WatchlistView> => liveRequest("GET", "watchlist", undefined, signal);
export const addWatch = (code: string): Promise<{ added: boolean }> => liveRequest("POST", "watchlist", { code });
export const removeWatch = (code: string): Promise<void> => liveRequest("DELETE", `watchlist/${code}`);
export const createAlertRule = (payload: CreateRulePayload): Promise<AlertRule> => liveRequest("POST", "alerts", payload);
export const deleteAlertRule = (id: string): Promise<void> => liveRequest("DELETE", `alerts/${id}`);
