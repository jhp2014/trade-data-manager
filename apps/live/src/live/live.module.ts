import { Module, Logger, Inject } from "@nestjs/common";
import type { OnModuleInit, OnModuleDestroy, Provider } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { SnapshotController } from "./snapshot.controller.js";
import { StreamController } from "./stream.controller.js";
import { LIVE_ENGINE } from "./tokens.js";
import { createLiveEngine } from "./engine/createLiveEngine.js";
import type { LiveEngine } from "./engine/engine.js";

// 실시간 모니터 모듈. 엔진(framework-free)을 Symbol 토큰으로 주입하고 lifecycle 로 start/stop.
// 조건식은 LIVE_CONDITION_NAME(영웅문 서버저장 이름). 미설정이면 엔진 idle(앱은 정상 부팅).
// 엔진 시작 실패(조건 없음·장외·연결오류)해도 앱은 유지 — /snapshot 은 빈 스냅샷.
const engineProvider: Provider = {
    provide: LIVE_ENGINE,
    useFactory: (): LiveEngine =>
        createLiveEngine(process.env.LIVE_CONDITION_NAME ?? "", Number(process.env.LIVE_POLL_MS) || undefined),
};

@Module({
    controllers: [HealthController, SnapshotController, StreamController],
    providers: [engineProvider],
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
