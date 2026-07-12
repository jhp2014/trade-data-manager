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
import { LIVE_ENGINE, KIWOOM, LIVE_CHART, LIVE_NEWS } from "./tokens.js";
import { createLiveEngine } from "./engine/createLiveEngine.js";
import type { LiveEngine } from "./engine/engine.js";

// 실시간 모니터 모듈. 엔진(framework-free)을 Symbol 토큰으로 주입하고 lifecycle 로 start/stop.
// 조건식은 LIVE_CONDITION_NAME(영웅문 서버저장 이름). 미설정이면 엔진 idle(앱은 정상 부팅).
// 엔진 시작 실패(조건 없음·장외·연결오류)해도 앱은 유지 — /snapshot 은 빈 스냅샷.
// kiwoom 은 단일 인스턴스(엔진+차트 공유 → CredentialPool 레이트 페이싱 정합).
const kiwoomProvider: Provider = { provide: KIWOOM, useFactory: (): Kiwoom => createKiwoom() };
const engineProvider: Provider = {
    provide: LIVE_ENGINE,
    useFactory: (kiwoom: Kiwoom): LiveEngine =>
        createLiveEngine(kiwoom, process.env.LIVE_CONDITION_NAME ?? "", Number(process.env.LIVE_POLL_MS) || undefined),
    inject: [KIWOOM],
};
const chartProvider: Provider = {
    provide: LIVE_CHART,
    useFactory: (kiwoom: Kiwoom): LiveChartService => new LiveChartService(kiwoom),
    inject: [KIWOOM],
};
// 뉴스는 kiwoom 이 아니라 KIS(별도 크레덴셜 풀) — 생성 자체가 lazy 라 부팅과 무관.
const newsProvider: Provider = { provide: LIVE_NEWS, useFactory: (): LiveNewsService => new LiveNewsService() };

@Module({
    controllers: [HealthController, SnapshotController, StreamController, ChartController, NewsController],
    providers: [kiwoomProvider, engineProvider, chartProvider, newsProvider],
})
export class LiveModule implements OnModuleInit, OnModuleDestroy {
    private readonly log = new Logger("LiveEngine");

    constructor(@Inject(LIVE_ENGINE) private readonly engine: LiveEngine) {}

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
    }
}
