// 실시간 엔진(오케스트레이터) — framework-free. 상시 5초 self-scheduling 루프로
// 스캔(멤버십)→시세 폴링→store 적재→'tick' emit. 정본: market-eye/src/engine/engine.ts 에서
// theme/sheets·focus·signals 제거·슬림화. NestJS 데코레이터는 여기 없음(모듈/컨트롤러 가장자리에만).
import { EventEmitter } from "node:events";
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { kstToday } from "@trade-data-manager/market";
import type { KiwoomWs, ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import { RankingScanner } from "./scanner.js";
import { pollQuotes } from "./poller.js";
import { EngineStore } from "./store.js";
import type { LiveSnapshot } from "@trade-data-manager/wire";
import { buildSnapshot } from "./snapshot.js";
import type { MembershipSource } from "./membership.js";
import type { TrailingHighsSource } from "./trailingHighs.js";
import type { Quote } from "./types.js";

export interface LiveEngineOptions {
    conditionName: string; // 스캔할 조건식 이름(영웅문 서버저장)
    pollMs?: number;
}

/** 알람 런타임 결합점 — 유니버스 합집합(watchCodes)과 틱 평가(tick) 두 지점만. 구현=alerts/AlertsRuntime. */
export interface AlertsHook {
    watchCodes(): string[];
    tick(quotes: readonly Quote[], themesOf: (code: string) => string[], now: number): void;
}

export class LiveEngine extends EventEmitter {
    readonly store = new EngineStore();
    private scanner: RankingScanner | null = null;
    private timer: NodeJS.Timeout | null = null;
    private running = false;
    private ready = false; // WS LOGIN+CNSRLST 완료 → 틱 허용. 재연결 중 false.

    private readonly conditionName: string;
    private readonly pollMs: number;

    constructor(
        private readonly kiwoom: Kiwoom,
        private readonly ws: KiwoomWs,
        private readonly membership: MembershipSource,
        private readonly trailing: TrailingHighsSource,
        opts: LiveEngineOptions,
        private readonly alerts?: AlertsHook, // 없으면 watchlist·알람 없이 스캔만(테스트·부분 조립 허용)
    ) {
        super();
        this.conditionName = opts.conditionName;
        this.pollMs = opts.pollMs ?? 5_000;
    }

    /** WS 연결 → 스캐너 init(CNSRLST) → 즉시 1틱 → 5초 루프. 끊기면 WS 가 백오프 재연결. */
    async start(): Promise<void> {
        this.ws.on("status", (s: ConnectionStatus) => {
            if (s !== "live") this.ready = false; // 끊기면 틱 보류(직전 데이터 유지)
            this.emit("status", s);
        });
        this.ws.on("reconnected", () => void this.onReconnect());
        await this.ws.connect();
        this.scanner = new RankingScanner(this.ws, this.conditionName);
        await this.scanner.init();
        await this.membership.reload().catch((err) => this.emit("error", err)); // 초기 멤버십 로드(실패해도 빈 멤버십으로 진행)
        this.ready = true;
        this.running = true;
        await this.tick().catch((err) => this.emit("error", err)); // 첫 틱 실패(일시 오류)해도 루프는 시작 — scheduleNext 와 동일 정책
        this.scheduleNext();
        this.emit("started", { conditionSeq: this.scanner.conditionSeq });
    }

    get connectionStatus(): ConnectionStatus {
        return this.ws.getStatus();
    }

    snapshot(): LiveSnapshot {
        const watch = new Set(this.alerts?.watchCodes() ?? []);
        return buildSnapshot(this.store, this.membership, this.trailing, this.ws.getStatus(), Date.now(), watch);
    }

    /** 시트 테마 멤버십 즉시 재로드 — 배정(apps/api 경유)·시트 직접편집을 실시간 보드에 바로 반영(컨트롤러가 온디맨드 호출). */
    async reloadMembership(): Promise<void> {
        await this.membership.reload();
    }

    /** 재연결 직후: CNSRREQ 전 CNSRLST 선조회 요구 때문에 scanner 재init. */
    private async onReconnect(): Promise<void> {
        if (!this.running || !this.scanner) return;
        try {
            await this.scanner.init();
            this.ready = true;
            this.emit("reconnected");
        } catch (err) {
            this.emit("error", err); // 다음 끊김/재연결 사이클에서 다시 시도
        }
    }

    /** 한 사이클: 멤버십 스캔 → 시세 폴링 → store 적재 → 'tick'. */
    private async tick(): Promise<void> {
        if (!this.scanner || !this.ready) return; // 재연결 중이면 보류
        const now = Date.now();
        const hits = await this.scanner.scan();
        this.store.setHot(hits, now);
        // 유니버스 = hot ∪ watchlist(타겟) — 타겟은 스캔 이탈해도 항상 폴링(2층 구조).
        const codes = [...new Set([...hits.map((h) => h.code), ...(this.alerts?.watchCodes() ?? [])])];
        const quotes = await pollQuotes(this.kiwoom.rest, codes, Date.now());
        this.store.updateQuotes(quotes);
        // 트레일링 고가 백그라운드 priming(멱등) — base(전일종가)는 방금 적재된 시세에서. ka10081 별도 레이트라 폴링 안 막음.
        const today = kstToday();
        for (const q of quotes) void this.trailing.ensure(q.code, q.base, today);
        // 알람 평가 — 이번 틱 신선한 시세만 넘긴다(과거 잔류 quotes 로 순위가 오염되지 않게).
        this.alerts?.tick(quotes, (c) => this.membership.themesOf(c), Date.now());
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
