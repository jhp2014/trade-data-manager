// 실시간 엔진(오케스트레이터) — framework-free. 상시 5초 self-scheduling 루프로
// 스캔(멤버십)→시세 폴링→store 적재→'tick' emit. 정본: market-eye/src/engine/engine.ts 에서
// theme/sheets·focus·signals 제거·슬림화. NestJS 데코레이터는 여기 없음(모듈/컨트롤러 가장자리에만).
import { EventEmitter } from "node:events";
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import type { KiwoomWs, ConnectionStatus } from "@trade-data-manager/kiwoom/ws";
import { RankingScanner } from "./scanner.js";
import { pollQuotes } from "./poller.js";
import { EngineStore } from "./store.js";
import { buildSnapshot, type LiveSnapshot } from "./snapshot.js";

export interface LiveEngineOptions {
    conditionName: string; // 스캔할 조건식 이름(영웅문 서버저장)
    pollMs?: number;
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
        opts: LiveEngineOptions,
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
        this.ready = true;
        this.running = true;
        await this.tick(); // 즉시 1회
        this.scheduleNext();
        this.emit("started", { conditionSeq: this.scanner.conditionSeq });
    }

    get connectionStatus(): ConnectionStatus {
        return this.ws.getStatus();
    }

    snapshot(): LiveSnapshot {
        return buildSnapshot(this.store, this.ws.getStatus(), Date.now());
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
        // 유니버스 = hot only (watchlist 는 후속 브릭에서 합집합)
        const quotes = await pollQuotes(this.kiwoom.rest, hits.map((h) => h.code), Date.now());
        this.store.updateQuotes(quotes);
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
