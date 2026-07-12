import { Module } from "@nestjs/common";
import { LiveModule } from "./live/live.module.js";

// 루트 모듈 — 지금은 LiveModule 하나(실시간 모니터/알람).
@Module({
    imports: [LiveModule],
})
export class AppModule {}
