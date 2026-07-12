import { Controller, Sse, Inject } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { fromEvent, merge, map, startWith, type Observable } from "rxjs";
import { LIVE_ENGINE } from "./tokens.js";
import type { LiveEngine } from "./engine/engine.js";

// 라이브 스냅샷 SSE 스트림 — 구독 즉시 현재 스냅샷 1회, 이후 엔진 tick/status 마다 push.
// workbench 가 EventSource 로 구독. 폴링 /snapshot 은 폴백으로 유지.
@Controller()
export class StreamController {
    constructor(@Inject(LIVE_ENGINE) private readonly engine: LiveEngine) {}

    @Sse("stream")
    stream(): Observable<MessageEvent> {
        const tick$ = fromEvent(this.engine, "tick");
        const status$ = fromEvent(this.engine, "status");
        return merge(tick$, status$).pipe(
            startWith(null), // 구독 즉시 현재 스냅샷 1회
            map((): MessageEvent => ({ data: this.engine.snapshot() })),
        );
    }
}
