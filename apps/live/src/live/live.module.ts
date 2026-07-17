import { Module, Logger, Inject } from "@nestjs/common";
import type { OnModuleInit, OnModuleDestroy, Provider } from "@nestjs/common";
import { createKiwoom } from "@trade-data-manager/kiwoom";
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { HealthController } from "./health.controller.js";
import { SnapshotController } from "./snapshot.controller.js";
import { StreamController } from "./stream.controller.js";
import { ThemeController } from "./theme.controller.js";
import { ChartController } from "./chart/chart.controller.js";
import { LiveChartService } from "./chart/liveChart.js";
import { NewsController } from "./news/news.controller.js";
import { LiveNewsService } from "./news/liveNews.js";
import { AlertsController } from "./alerts/alerts.controller.js";
import { AlertConfigStore } from "./alerts/configStore.js";
import { AlertsRuntime } from "./alerts/alertsRuntime.js";
import { buildFiringMessages, formatFiring, kstTime } from "./alerts/format.js";
import { createAlertNotifierFromEnv, type AlertNotifier } from "./alerts/createNotifier.js";
import { NotifyQueue } from "./alerts/notifyQueue.js";
import { HealthMonitor, parseWindow } from "./health/monitor.js";
import { ConditionController } from "./condition.controller.js";
import { EngineConfigStore } from "./engine/engineConfigStore.js";
import { LIVE_ENGINE, KIWOOM, LIVE_CHART, LIVE_NEWS, ALERT_CONFIG, ALERTS, ALERT_NOTIFIER, NOTIFY_QUEUE, HEALTH, ENGINE_CONFIG } from "./tokens.js";
import { createLiveEngine } from "./engine/createLiveEngine.js";
import type { LiveEngine } from "./engine/engine.js";

// 실시간 모니터 모듈. 엔진(framework-free)을 Symbol 토큰으로 주입하고 lifecycle 로 start/stop.
// 조건식 = 엔진설정 파일(워크벤치 설정 모달에서 선택) > env LIVE_CONDITION_NAME(부팅 기본값).
// 미선택이어도 엔진은 시작 — 스캔 없이 watchlist 폴링·알람 동작, 조건은 POST /condition 으로 나중에.
// 엔진 시작 실패(장외·연결오류)해도 앱은 유지 — /snapshot 은 빈 스냅샷.
// kiwoom 은 단일 인스턴스(엔진+차트 공유 → CredentialPool 레이트 페이싱 정합).
const kiwoomProvider: Provider = { provide: KIWOOM, useFactory: (): Kiwoom => createKiwoom() };
// 엔진 설정(조건검색 선택) — JSON 파일 영속. 파일값(빈 문자열=명시적 해제 포함) > env.
const engineConfigProvider: Provider = {
    provide: ENGINE_CONFIG,
    useFactory: (): EngineConfigStore => {
        const store = new EngineConfigStore(process.env.LIVE_ENGINE_CONFIG?.trim() || "data/live-engine.json");
        const corrupt = store.load();
        if (corrupt) new Logger("Engine").warn(`엔진 설정 파일 손상 — ${corrupt} 로 백업하고 빈 설정으로 시작`);
        return store;
    },
};
// 알람 설정(watchlist+룰) — JSON 파일 영속(DB-free). 손상 파일은 백업 후 빈 설정으로 degrade.
const alertConfigProvider: Provider = {
    provide: ALERT_CONFIG,
    useFactory: (): AlertConfigStore => {
        const store = new AlertConfigStore(process.env.LIVE_ALERT_CONFIG?.trim() || "data/live-alerts.json");
        const corrupt = store.load();
        if (corrupt) new Logger("Alerts").warn(`알람 설정 파일 손상 — ${corrupt} 로 백업하고 빈 설정으로 시작`);
        return store;
    },
};
// 알림 전송로(env 선택: bot=Bot API/user=MTProto) — 미설정이면 null(로그로만). 모듈 종료 시 close.
const notifierProvider: Provider = {
    provide: ALERT_NOTIFIER,
    useFactory: (): AlertNotifier | null => {
        const log = new Logger("Alerts");
        const made = createAlertNotifierFromEnv();
        if (!made) {
            log.warn("텔레그램 전송 미설정(LIVE_TELEGRAM_*) — 알람은 서버 로그로만 전달");
            return null;
        }
        log.log(`알람 전송로: ${made.label}`);
        return made.notifier;
    },
};
// 알림 재시도 큐 — 발화·헬스 텍스트의 유일한 전송 경로(백오프·TTL 10분·지연 표기). 전송로 없으면 로그 전용.
const notifyQueueProvider: Provider = {
    provide: NOTIFY_QUEUE,
    useFactory: (notifier: AlertNotifier | null): NotifyQueue => {
        const log = new Logger("Alerts");
        return new NotifyQueue(
            notifier,
            ({ firstAt, summary }) => log.warn(`알림 TTL 폐기(${kstTime(firstAt)} 적재): ${summary}`),
            (e) => log.error(`텔레그램 전송 실패(재시도 예정): ${e instanceof Error ? e.message : String(e)}`),
        );
    },
    inject: [ALERT_NOTIFIER],
};
// 알람 런타임 — 게이트·로그는 런타임이 소유. 여기 sink 는 배달만 한다:
// 억제분 포함 전부 journalctl 에 남기고(디버깅), 배달분만 재시도 큐로.
const alertsProvider: Provider = {
    provide: ALERTS,
    useFactory: (config: AlertConfigStore, queue: NotifyQueue): AlertsRuntime => {
        const log = new Logger("Alerts");
        return new AlertsRuntime(config, ({ passed, suppressed }) => {
            const now = Date.now();
            for (const f of passed) log.log(`🔔 ${formatFiring(f)}`);
            for (const f of suppressed) log.log(`🔕 ${formatFiring(f)} (쿨다운 억제 — 워크벤치 로그엔 남음)`);
            for (const msg of buildFiringMessages(passed)) queue.push(msg, now);
        });
    },
    inject: [ALERT_CONFIG, NOTIFY_QUEUE],
};
// 헬스 모니터 — 엔진 틱/WS/전송큐 감시. 알림 창·하트비트는 env(LIVE_ALERT_WINDOW·LIVE_HEARTBEAT).
const healthProvider: Provider = {
    provide: HEALTH,
    useFactory: (engine: LiveEngine, queue: NotifyQueue, config: AlertConfigStore): HealthMonitor => {
        let lastTickAt: number | null = null;
        engine.on("tick", () => { lastTickAt = Date.now(); });
        const win = parseWindow(process.env.LIVE_ALERT_WINDOW) ?? { start: 8 * 60, end: 15 * 60 + 40 };
        return new HealthMonitor(
            {
                lastTickAt: () => lastTickAt,
                wsStatus: () => engine.connectionStatus,
                queueStats: () => queue.stats(),
                ruleCount: () => config.alarms.length,
                notify: (text, now, priority) => queue.pushText(text, now, priority),
            },
            { windowStartMin: win.start, windowEndMin: win.end, heartbeat: process.env.LIVE_HEARTBEAT !== "0" },
        );
    },
    inject: [LIVE_ENGINE, NOTIFY_QUEUE, ALERT_CONFIG],
};
const engineProvider: Provider = {
    provide: LIVE_ENGINE,
    useFactory: (kiwoom: Kiwoom, alerts: AlertsRuntime, config: EngineConfigStore): LiveEngine =>
        createLiveEngine(kiwoom, config.conditionName ?? process.env.LIVE_CONDITION_NAME ?? "", Number(process.env.LIVE_POLL_MS) || undefined, alerts),
    inject: [KIWOOM, ALERTS, ENGINE_CONFIG],
};
const chartProvider: Provider = {
    provide: LIVE_CHART,
    useFactory: (kiwoom: Kiwoom): LiveChartService => new LiveChartService(kiwoom),
    inject: [KIWOOM],
};
// 뉴스는 kiwoom 이 아니라 KIS(별도 크레덴셜 풀) — 생성 자체가 lazy 라 부팅과 무관.
const newsProvider: Provider = { provide: LIVE_NEWS, useFactory: (): LiveNewsService => new LiveNewsService() };

@Module({
    controllers: [HealthController, SnapshotController, StreamController, ThemeController, ChartController, NewsController, AlertsController, ConditionController],
    providers: [kiwoomProvider, engineConfigProvider, alertConfigProvider, notifierProvider, notifyQueueProvider, alertsProvider, healthProvider, engineProvider, chartProvider, newsProvider],
})
export class LiveModule implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger("LiveEngine");
    private timers: NodeJS.Timeout[] = [];

    constructor(
        @Inject(LIVE_ENGINE) private readonly engine: LiveEngine,
        @Inject(ALERT_NOTIFIER) private readonly notifier: AlertNotifier | null,
        @Inject(NOTIFY_QUEUE) private readonly queue: NotifyQueue,
        @Inject(HEALTH) private readonly health: HealthMonitor,
    ) {}

    async onModuleInit(): Promise<void> {
        this.engine.on("error", (e: unknown) =>
            this.log.error(`엔진 오류(루프 유지): ${e instanceof Error ? e.message : String(e)}`),
        );
        this.engine.on("tick", (t: { hot: number; polled: number }) =>
            this.log.debug(`tick hot=${t.hot} polled=${t.polled}`),
        );
        // 'started' 로 로그 — 첫 연결이 인라인이든 백그라운드 재시도든 성공 시점에 한 번 찍힌다.
        this.engine.on("started", () => {
            const cond = this.engine.condition;
            this.log.log(cond ? `엔진 시작 — 조건 '${cond}'` : "엔진 시작 — 조건 미선택(설정 모달에서 선택, watchlist 폴링만)");
        });
        // 알림 큐 소화 루프(1s) — 엔진과 무관하게 먼저.
        this.timers.push(setInterval(() => void this.queue.tick(Date.now()), 1_000));
        try {
            await this.engine.start(); // 성공 로그는 'started' 핸들러가 찍는다
        } catch (e) {
            // 앱은 유지되고 엔진은 백그라운드로 재시도(5s→…→5m) — 복구되면 'started' 가 찍힌다.
            this.log.error(`엔진 시작 실패(백그라운드 재시도 예약): ${e instanceof Error ? e.message : String(e)}`);
        }
        // 헬스 판정(15s, 하트비트·엣지알림) · 외부 데드맨 핑(60s) — 엔진 시작 시도 **후**에 걸어
        // 부팅 수 초를 "틱 없음"으로 오탐하지 않게. 시작 실패면 첫 판정부터 이상으로 잡힘(의도).
        this.timers.push(setInterval(() => this.health.check(Date.now()), 15_000));
        const pingUrl = process.env.LIVE_HEALTHCHECK_URL?.trim();
        if (pingUrl) {
            const log = this.log;
            this.timers.push(
                setInterval(() => {
                    if (this.health.shouldPing(Date.now())) {
                        // res.ok 검사 필수 — 잘못된 URL(404)이면 fetch 는 성공으로 끝나 조용히 죽는다(이 축이 막으려는 그 실패).
                        void fetch(pingUrl)
                            .then((res) => {
                                if (!res.ok) log.warn(`데드맨 핑 거부(HTTP ${res.status}) — LIVE_HEALTHCHECK_URL 확인`);
                            })
                            .catch((e: unknown) => log.warn(`데드맨 핑 실패: ${e instanceof Error ? e.message : String(e)}`));
                    }
                }, 60_000),
            );
            this.log.log("외부 데드맨 핑 활성(LIVE_HEALTHCHECK_URL)");
        } else {
            this.log.warn("LIVE_HEALTHCHECK_URL 미설정 — 외부 데드맨 없음(서버 전멸·텔레그램 죽음 미감지)");
        }
    }

    async onModuleDestroy(): Promise<void> {
        for (const t of this.timers) clearInterval(t);
        await this.engine.stop();
        await this.notifier?.close?.(); // MTProto 접속 정리(Bot API 는 close 없음)
    }
}
