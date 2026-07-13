import { Module, Logger, Inject } from "@nestjs/common";
import type { OnModuleInit, OnModuleDestroy, Provider } from "@nestjs/common";
import { createKiwoom } from "@trade-data-manager/kiwoom";
import type { Kiwoom } from "@trade-data-manager/kiwoom";
import { HealthController } from "./health.controller.js";
import { SnapshotController } from "./snapshot.controller.js";
import { StreamController } from "./stream.controller.js";
import { ChartController } from "./chart/chart.controller.js";
import { LiveChartService } from "./chart/liveChart.js";
import { NewsController } from "./news/news.controller.js";
import { LiveNewsService } from "./news/liveNews.js";
import { AlertsController } from "./alerts/alerts.controller.js";
import { AlertConfigStore } from "./alerts/configStore.js";
import { AlertsRuntime } from "./alerts/alertsRuntime.js";
import { formatFiring } from "./alerts/format.js";
import { createAlertNotifierFromEnv, type AlertNotifier } from "./alerts/createNotifier.js";
import { LIVE_ENGINE, KIWOOM, LIVE_CHART, LIVE_NEWS, ALERT_CONFIG, ALERTS, ALERT_NOTIFIER } from "./tokens.js";
import { createLiveEngine } from "./engine/createLiveEngine.js";
import type { LiveEngine } from "./engine/engine.js";

// 실시간 모니터 모듈. 엔진(framework-free)을 Symbol 토큰으로 주입하고 lifecycle 로 start/stop.
// 조건식은 LIVE_CONDITION_NAME(영웅문 서버저장 이름). 미설정이면 엔진 idle(앱은 정상 부팅).
// 엔진 시작 실패(조건 없음·장외·연결오류)해도 앱은 유지 — /snapshot 은 빈 스냅샷.
// kiwoom 은 단일 인스턴스(엔진+차트 공유 → CredentialPool 레이트 페이싱 정합).
const kiwoomProvider: Provider = { provide: KIWOOM, useFactory: (): Kiwoom => createKiwoom() };
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
// 알람 런타임 — 발화 sink = 서버 로그(항상) + 텔레그램(설정 시).
const alertsProvider: Provider = {
    provide: ALERTS,
    useFactory: (config: AlertConfigStore, notifier: AlertNotifier | null): AlertsRuntime => {
        const log = new Logger("Alerts");
        return new AlertsRuntime(config, (firings) => {
            for (const f of firings) log.log(`🔔 ${formatFiring(f)}`);
            if (notifier) {
                void notifier.send(firings).catch((e: unknown) =>
                    log.error(`텔레그램 알림 실패(알람 로그는 위에 남음): ${e instanceof Error ? e.message : String(e)}`),
                );
            }
        });
    },
    inject: [ALERT_CONFIG, ALERT_NOTIFIER],
};
const engineProvider: Provider = {
    provide: LIVE_ENGINE,
    useFactory: (kiwoom: Kiwoom, alerts: AlertsRuntime): LiveEngine =>
        createLiveEngine(kiwoom, process.env.LIVE_CONDITION_NAME ?? "", Number(process.env.LIVE_POLL_MS) || undefined, alerts),
    inject: [KIWOOM, ALERTS],
};
const chartProvider: Provider = {
    provide: LIVE_CHART,
    useFactory: (kiwoom: Kiwoom): LiveChartService => new LiveChartService(kiwoom),
    inject: [KIWOOM],
};
// 뉴스는 kiwoom 이 아니라 KIS(별도 크레덴셜 풀) — 생성 자체가 lazy 라 부팅과 무관.
const newsProvider: Provider = { provide: LIVE_NEWS, useFactory: (): LiveNewsService => new LiveNewsService() };

@Module({
    controllers: [HealthController, SnapshotController, StreamController, ChartController, NewsController, AlertsController],
    providers: [kiwoomProvider, alertConfigProvider, notifierProvider, alertsProvider, engineProvider, chartProvider, newsProvider],
})
export class LiveModule implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger("LiveEngine");

    constructor(
        @Inject(LIVE_ENGINE) private readonly engine: LiveEngine,
        @Inject(ALERT_NOTIFIER) private readonly notifier: AlertNotifier | null,
    ) {}

    async onModuleInit(): Promise<void> {
        const cond = process.env.LIVE_CONDITION_NAME;
        if (!cond) {
            this.log.warn("LIVE_CONDITION_NAME 미설정 — 엔진 idle(스캔 안 함). /snapshot 은 빈 스냅샷.");
            return;
        }
        this.engine.on("error", (e: unknown) =>
            this.log.error(`엔진 오류(루프 유지): ${e instanceof Error ? e.message : String(e)}`),
        );
        this.engine.on("tick", (t: { hot: number; polled: number }) =>
            this.log.debug(`tick hot=${t.hot} polled=${t.polled}`),
        );
        try {
            await this.engine.start();
            this.log.log(`엔진 시작 — 조건 '${cond}'`);
        } catch (e) {
            this.log.error(`엔진 시작 실패(앱은 유지): ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.engine.stop();
        await this.notifier?.close?.(); // MTProto 접속 정리(Bot API 는 close 없음)
    }
}
