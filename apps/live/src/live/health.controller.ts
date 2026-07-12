import { Controller, Get } from "@nestjs/common";

// 부팅 확인용 최소 엔드포인트(엔진/SSE 붙기 전 스켈레톤).
@Controller()
export class HealthController {
    @Get("health")
    health(): { ok: true; service: "live" } {
        return { ok: true, service: "live" };
    }
}
