// 조건검색식 조회·선택 REST — 워크벤치 설정 모달(조건검색 화면)이 소비. 계약은 contracts/wire(live.ts).
//  GET  /conditions          서버저장 조건식 목록(CNSRLST) + 현재 선택
//  POST /condition {name}    조건 교체(스캐너 재-init, 즉시 1틱) + 영속. 빈 문자열=해제.
import { Controller, Get, Post, Body, Inject, BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import type { LiveConditionsView } from "@trade-data-manager/wire";
import { LIVE_ENGINE, ENGINE_CONFIG } from "./tokens.js";
import type { LiveEngine } from "./engine/engine.js";
import { EngineConfigStore } from "./engine/engineConfigStore.js";

@Controller()
export class ConditionController {
    constructor(
        @Inject(LIVE_ENGINE) private readonly engine: LiveEngine,
        @Inject(ENGINE_CONFIG) private readonly config: EngineConfigStore,
    ) {}

    @Get("conditions")
    async list(): Promise<LiveConditionsView> {
        try {
            return { current: this.engine.condition, list: await this.engine.listConditions() };
        } catch (e) {
            // WS 미연결(엔진 시작 실패·재연결 중) — 목록 조회 자체가 불가.
            throw new ServiceUnavailableException(`조건식 목록 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    @Post("condition")
    async select(@Body() body: { name?: unknown }): Promise<{ ok: true; current: string }> {
        if (typeof body?.name !== "string") throw new BadRequestException("name(문자열) 필요 — 빈 문자열=조건 해제");
        const name = body.name.trim();
        try {
            await this.engine.switchCondition(name);
        } catch (e) {
            // 목록에 없는 이름·엔진 미기동 — 기존 조건은 무손상 유지.
            throw new BadRequestException(`조건 교체 실패: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.config.setConditionName(name); // 교체 성공 후에만 영속(재기동 시 이 값이 env 보다 우선)
        return { ok: true, current: name };
    }
}
