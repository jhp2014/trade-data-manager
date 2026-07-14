// 실시간 엔진(오케스트레이터) — framework-free. 상시 5초 self-scheduling 루프로
// 스캔(멤버십)→시세 폴링→store 적재→'tick' emit. 정본: market-eye/src/engine/engine.ts 에서
// theme/sheets·focus·signals 제거·슬림화. NestJS 데코레이터는 여기 없음(모듈/컨트롤러 가장자리에만).
import { EventEmitter } from "node:events";
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { kstToday } from "@trade-data-manager/market";
import type { KiwoomWs, ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import { RankingScanner, fetchConditionList } from "./scanner.js";
import { pollQuotes } from "./poller.js";
import { EngineStore } from "./store.js";
import type { LiveSnapshot, LiveConditionEntry } from "@trade-data-manager/wire";
import { buildSnapshot } from "./snapshot.js";
import type { MembershipSource } from "./membership.js";
import type { DailyContextSource } from "./dailyContext.js";
import type { Quote } from "./types.js";

export interface LiveEngineOptions {
    conditionName: string; // 스캔할 조건식 이름(영웅문 서버저장). 빈 문자열=미선택(스캔 없이 watchlist 만 폴링).
    pollMs?: number;
}

/** 알람 런타임 결합점 — 유니버스 합집합(watchCodes)과 틱 평가(tick) 두 지점만. 구현=alerts/AlertsRuntime. */
export interface AlertsHook {
    watchCodes(): string[];
    tick(
        quotes: readonly Quote[],
        themesOf: (code: string) => string[],
        prevCloseOf: (code: string, market: "krx" | "un") => number | undefined,
        now: number,
    ): void;
}

export class LiveEngine extends EventEmitter {
    readonly store = new EngineStore();
    private scanner: RankingScanner | null = null;
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private ready = false; // WS LOGIN+CNSRLST 완료 → 틱 허용. 재연결 중 false.

    private conditionName: string; // switchCondition 으로 런타임 교체 가능
    private readonly pollMs: number;

    constructor(
        private readonly kiwoom: Kiwoom,
        private readonly ws: KiwoomWs,
        private readonly membership: MembershipSource,
        private readonly dailyCtx: DailyContextSource,
        opts: LiveEngineOptions,
        private readonly alerts?: AlertsHook, // 없으면 watchlist·알람 없이 스캔만(테스트·부분 조립 허용)
    ) {
        super();
        this.conditionName = opts.conditionName;
        this.pollMs = opts.pollMs ?? 5_000;
    }

    /** WS 연결 → (조건 있으면) 스캐너 init(CNSRLST) → 즉시 1틱 → 5초 루프. 끊기면 WS 가 백오프 재연결.
     *  조건 미선택(빈 이름)이어도 시작 — 스캔 없이 watchlist 폴링·알람은 동작, 조건은 switchCondition 으로 나중에. */
    async start(): Promise<void> {
        this.ws.on("status", (s: ConnectionStatus) => {
            if (s !== "live") this.ready = false; // 끊기면 틱 보류(직전 데이터 유지)
            this.emit("status", s);
        });
        this.ws.on("reconnected", () => void this.onReconnect());
        await this.ws.connect();
        if (this.conditionName) {
            this.scanner = new RankingScanner(this.ws, this.conditionName);
            await this.scanner.init();
        }
        await this.membership.reload().catch((err) => this.emit("error", err)); // 초기 멤버십 로드(실패해도 빈 멤버십으로 진행)
        this.ready = true;
        this.running = true;
        await this.tick().catch((err) => this.emit("error", err)); // 첫 틱 실패(일시 오류)해도 루프는 시작 — scheduleNext 와 동일 정책
        this.scheduleNext();
        this.emit("started", { conditionSeq: this.scanner?.conditionSeq ?? null });
    }

    get connectionStatus(): ConnectionStatus {
        return this.ws.getStatus();
    }

    /** 현재 선택된 조건식 이름(빈 문자열=미선택). */
    get condition(): string {
        return this.conditionName;
    }

    /** 서버저장 조건식 전체 목록(CNSRLST) — 설정 UI 용. WS 미연결이면 throw(컨트롤러가 503). */
    listConditions(): Promise<LiveConditionEntry[]> {
        return fetchConditionList(this.ws);
    }

    /**
     * 조건식 런타임 교체 — 새 스캐너 init(이름→seq, 실패 시 기존 유지) 후 원자 스왑 + 즉시 1틱.
     * 빈 이름 = 조건 해제(hot 비움, watchlist 폴링은 계속). 영속은 호출자(컨트롤러→config) 책임.
     */
    async switchCondition(name: string): Promise<void> {
        if (!this.running) throw new Error("엔진 미기동 — 서버 로그 확인(WS 연결 실패?)");
        if (name === "") {
            this.scanner = null;
            this.conditionName = "";
            this.store.setHot([], Date.now());
            return;
        }
        const next = new RankingScanner(this.ws, name);
        await next.init(); // 목록에 없으면 throw — 기존 스캐너 무손상
        this.scanner = next;
        this.conditionName = name;
        await this.tick().catch((err) => this.emit("error", err)); // 즉시 반영(실패해도 5초 루프가 재시도)
    }

    snapshot(): LiveSnapshot {
        const watch = new Set(this.alerts?.watchCodes() ?? []);
        return buildSnapshot(this.store, this.membership, this.dailyCtx, this.ws.getStatus(), Date.now(), watch);
    }

    /** 시트 테마 멤버십 즉시 재로드 — 배정(apps/api 경유)·시트 직접편집을 실시간 보드에 바로 반영(컨트롤러가 온디맨드 호출). */
    async reloadMembership(): Promise<void> {
        await this.membership.reload();
    }

    /** 재연결 직후: CNSRREQ 전 CNSRLST 선조회 요구 때문에 scanner 재init. 조건 미선택이면 ready 만 복구. */
    private async onReconnect(): Promise<void> {
        if (!this.running) return;
        try {
            await this.scanner?.init();
            this.ready = true;
            this.emit("reconnected");
        } catch (err) {
            this.emit("error", err); // 다음 끊김/재연결 사이클에서 다시 시도
        }
    }

    /** 한 사이클: 멤버십 스캔 → 시세 폴링 → store 적재 → 'tick'. 조건 미선택이면 hot 없이 watchlist 만. */
    private async tick(): Promise<void> {
        if (!this.ready) return; // 재연결 중이면 보류
        const now = Date.now();
        const hits = this.scanner ? await this.scanner.scan() : [];
        this.store.setHot(hits, now);
        // 유니버스 = hot ∪ watchlist(타겟) — 타겟은 스캔 이탈해도 항상 폴링(2층 구조).
        const codes = [...new Set([...hits.map((h) => h.code), ...(this.alerts?.watchCodes() ?? [])])];
        const quotes = await pollQuotes(this.kiwoom.rest, codes, Date.now());
        this.store.updateQuotes(quotes);
        // 일봉 컨텍스트(수정 트레일링 두벌+원주가 전일종가) 백그라운드 priming(멱등). ka10081 별도 레이트라 폴링 안 막음.
        const today = kstToday();
        for (const q of quotes) void this.dailyCtx.ensure(q.code, today);
        // 알람 평가 — 이번 틱 신선한 시세만 넘긴다(과거 잔류 quotes 로 순위가 오염되지 않게).
        // 등락률·순위 잣대 = 일봉 컨텍스트의 market 전일종가(미도착이면 그 leaf 미결 → 스킵).
        this.alerts?.tick(
            quotes,
            (c) => this.membership.themesOf(c),
            (c, m) => this.dailyCtx.contextOf(c)?.rawPrevClose[m] ?? undefined,
            Date.now(),
        );
        this.emit("tick", { hot: hits.length, polled: quotes.length, ts: Date.now() });
    }

    private scheduleNext(): void {
        this.timer = setTimeout(async () => {
            if (!this.running) return;
            try {
                await this.tick();
            } catch (err) {
                this.emit("error", err); // 한 틱 실패해도 루프 유지
            }
            if (this.running) this.scheduleNext();
        }, this.pollMs);
    }

    async stop(): Promise<void> {
        this.running = false;
        if (this.timer) clearTimeout(this.timer);
        this.ws.close();
        this.emit("stopped");
    }
}
