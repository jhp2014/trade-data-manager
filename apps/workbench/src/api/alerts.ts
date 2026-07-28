// watchlist·알람 규칙 클라이언트 — apps/live(/live 프록시 → :3002) REST. 계약은 contracts/wire(alerts.ts).
// 4b 통합: 규칙 = AlarmRule(code 스코프=집중감시/없으면 유니버스), 조건 = core 술어 인스턴스.
import type { AlarmRule, AlarmPredicateInstance, AlertLogView, BlacklistEntry, UniverseView, WatchlistView } from "@trade-data-manager/wire";
import { liveGet, livePost, livePut, liveDelete } from "./http.js";

export type {
    AlarmPredicateInstance,
    AlarmRule,
    AlarmRuleView,
    AlertDelivery,
    AlertFiring,
    AlertLogEntry,
    AlertLogView,
    AlertMarket,
    AlertScope,
    AlertThemeContext,
    AlertThemeMember,
    BlacklistEntry,
    CooldownKeyMode,
    LeafEvidence,
    UniverseView,
    WatchlistView,
} from "@trade-data-manager/wire";

/** PUT /live/universe/rules 요청의 규칙 모양 — id 없으면 서버 발급(code 는 서버가 무시 — 유니버스 전용). */
export type UniverseRuleDraft = Omit<AlarmRule, "id" | "code"> & { id?: string };

/** POST /live/alerts 요청 몸체 — 집중 감시(code 스코프) 규칙. predicates = AND. */
export interface CreateRulePayload {
    code: string;
    predicates: AlarmPredicateInstance[];
    cooldownMs?: number;
    name?: string;
}

export const fetchWatchlist = (signal?: AbortSignal): Promise<WatchlistView> => liveGet<WatchlistView>("watchlist", undefined, signal);
/** 발화 로그 증분 — since 초과분만(0=전체). 전체를 매 폴링마다 내리면 5초×수 MB 라 커서로 받는다. */
export const fetchAlertLog = (since: number, signal?: AbortSignal): Promise<AlertLogView> =>
    liveGet<AlertLogView>("alerts/log", { since: String(since) }, signal);
export const addWatch = (code: string): Promise<{ added: boolean }> => livePost<{ added: boolean }>("watchlist", { code });
export const removeWatch = (code: string): Promise<void> => liveDelete(`watchlist/${code}`);
export const createAlertRule = (payload: CreateRulePayload): Promise<AlarmRule> => livePost<AlarmRule>("alerts", payload);
export const deleteAlertRule = (id: string): Promise<void> => liveDelete(`alerts/${id}`);

// 유니버스 조건검색 알람 — 설정은 클라가 편집, 계산·발화는 서버(live)가 소유.
export const fetchUniverse = (signal?: AbortSignal): Promise<UniverseView> => liveGet<UniverseView>("universe", undefined, signal);
export const putUniverseRules = (rules: UniverseRuleDraft[]): Promise<AlarmRule[]> => livePut<AlarmRule[]>("universe/rules", { rules });
export const addUniverseBlacklist = (code: string, scope: "telegram" | "all" = "telegram"): Promise<BlacklistEntry> =>
    livePost<BlacklistEntry>("universe/blacklist", { code, scope });
export const removeUniverseBlacklist = (code: string): Promise<void> => liveDelete(`universe/blacklist/${code}`);
