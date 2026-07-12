import { Controller, Get, Inject } from "@nestjs/common";
import { LIVE_ENGINE } from "./tokens.js";
import type { LiveEngine } from "./engine/engine.js";
import type { LiveSnapshot } from "./engine/snapshot.js";

// 현재 라이브 스냅샷을 온디맨드로 반환(폴링용). SSE 스트림은 후속 브릭.
@Controller()
export class SnapshotController {
    constructor(@Inject(LIVE_ENGINE) private readonly engine: LiveEngine) {}

    @Get("snapshot")
    snapshot(): LiveSnapshot {
        return this.engine.snapshot();
    }
}
