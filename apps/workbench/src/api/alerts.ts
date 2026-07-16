// watchlist·알람조건 클라이언트 — apps/live(/live 프록시 → :3002) REST. 계약은 contracts/wire(alerts.ts).
import type { AlertRule, AlertLeaf, AlertLogView, WatchlistView } from "@trade-data-manager/wire";

export type {
    AlertRule,
    AlertRuleView,
    AlertFiring,
    AlertLogEntry,
    AlertLogView,
    AlertScope,
    LeafEvidence,
    WatchlistView,
    AlertLeaf,
    AlertMarket,
    AlertOp,
    PriceLeaf,
    RankLeaf,
} from "@trade-data-manager/wire";

/** POST /live/alerts 요청 몸체 — 조건 = leaf(AND) 리스트. */
export interface CreateRulePayload {
    code: string;
    leaves: AlertLeaf[];
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
/** 발화 로그 증분 — since 초과분만(0=전체). 전체를 매 폴링마다 내리면 5초×수 MB 라 커서로 받는다. */
export const fetchAlertLog = (since: number, signal?: AbortSignal): Promise<AlertLogView> =>
    liveRequest("GET", `alerts/log?since=${since}`, undefined, signal);
export const addWatch = (code: string): Promise<{ added: boolean }> => liveRequest("POST", "watchlist", { code });
export const removeWatch = (code: string): Promise<void> => liveRequest("DELETE", `watchlist/${code}`);
export const createAlertRule = (payload: CreateRulePayload): Promise<AlertRule> => liveRequest("POST", "alerts", payload);
export const deleteAlertRule = (id: string): Promise<void> => liveRequest("DELETE", `alerts/${id}`);
