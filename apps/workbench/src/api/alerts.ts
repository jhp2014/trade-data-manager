// watchlist·알람조건 클라이언트 — apps/live(/live 프록시 → :3002) REST. 계약은 contracts/wire(alerts.ts).
import type { AlertRule, AlertGroup, WatchlistView } from "@trade-data-manager/wire";

export type {
    AlertRule,
    AlertRuleView,
    AlertFiring,
    WatchlistView,
    AlertLeaf,
    AlertGroup,
    AlertMarket,
    AlertOp,
    PriceLeaf,
    RateLeaf,
    RankLeaf,
} from "@trade-data-manager/wire";

/** POST /live/alerts 요청 몸체 — 조건 = 그룹(OR)들의 DNF, 각 그룹 = leaf(AND)들. */
export interface CreateRulePayload {
    code: string;
    groups: AlertGroup[];
    cooldownMs?: number;
    note?: string;
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
