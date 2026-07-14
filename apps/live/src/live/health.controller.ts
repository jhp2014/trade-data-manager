import { Controller, Get, Inject } from "@nestjs/common";
import type { HealthMonitor, HealthSnapshot } from "./health/monitor.js";
import { HEALTH } from "./tokens.js";

// 헬스 엔드포인트 — 부팅 확인(ok) + 알람 신뢰 신호(additive: 틱 age·WS·전송큐). RUNBOOK §2.
@Controller()
export class HealthController {
    constructor(@Inject(HEALTH) private readonly monitor: HealthMonitor) {}

    @Get("health")
    health(): { ok: true; service: "live"; alerts: HealthSnapshot } {
        return { ok: true, service: "live", alerts: this.monitor.evaluate(Date.now()) };
    }
}
