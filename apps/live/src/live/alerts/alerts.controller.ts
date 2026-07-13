// watchlist·알람룰 REST — 타겟 패널이 폴링·편집. 계약은 contracts/wire(alerts.ts).
//  GET    /watchlist            전체 뷰(codes+rules+runtime state+최근 발화)
//  POST   /watchlist {code}     타겟 승격
//  DELETE /watchlist/:code      타겟 해제(그 종목 룰 연쇄 삭제)
//  POST   /alerts {code,band?,rank?,cooldownMs?,note?,baseline?}  룰 추가(baseline 서버 해소)
//  DELETE /alerts/:id           룰 삭제
import { Controller, Get, Post, Delete, Body, Param, Inject, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { AlertRule, BandCondition, RankCondition, WatchlistView } from "./types.js";
import { AlertConfigStore } from "./configStore.js";
import type { AlertsRuntime } from "./alertsRuntime.js";
import type { LiveEngine } from "../engine/engine.js";
import { ALERT_CONFIG, ALERTS, LIVE_ENGINE } from "../tokens.js";

const CODE_RE = /^\d{6}$/;

interface CreateRuleBody {
    code?: string;
    band?: { lowerPct?: number | null; upperPct?: number | null };
    rank?: { theme?: string; mode?: string; threshold?: number };
    cooldownMs?: number;
    note?: string;
    /** 서버에 아직 시세가 없을 때(방금 승격)의 폴백 — 클라가 보고 있는 현재가. */
    baseline?: number;
}

function assertCode(code?: string): asserts code is string {
    if (!code || !CODE_RE.test(code)) throw new BadRequestException("code 형식(6자리 숫자)");
}

/** 유한수 또는 null(무제한)만 허용. undefined 는 null 로 정규화. */
function normPct(v: number | null | undefined, label: string): number | null {
    if (v == null) return null;
    if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequestException(`${label} 는 숫자(%) 또는 null(무제한)`);
    return v;
}

@Controller()
export class AlertsController {
    constructor(
        @Inject(ALERT_CONFIG) private readonly config: AlertConfigStore,
        @Inject(ALERTS) private readonly alerts: AlertsRuntime,
        @Inject(LIVE_ENGINE) private readonly engine: LiveEngine,
    ) {}

    @Get("watchlist")
    view(): WatchlistView {
        return this.alerts.view();
    }

    @Post("watchlist")
    addWatch(@Body() body: { code?: string }): { added: boolean } {
        assertCode(body.code);
        return { added: this.config.addWatch(body.code) };
    }

    @Delete("watchlist/:code")
    removeWatch(@Param("code") code: string): void {
        assertCode(code);
        this.config.removeWatch(code);
    }

    @Post("alerts")
    addRule(@Body() body: CreateRuleBody): AlertRule {
        assertCode(body.code);
        if (!body.band && !body.rank) throw new BadRequestException("band 또는 rank 중 최소 1개 필요");

        let band: BandCondition | undefined;
        if (body.band) {
            const lowerPct = normPct(body.band.lowerPct, "band.lowerPct");
            const upperPct = normPct(body.band.upperPct, "band.upperPct");
            if (lowerPct == null && upperPct == null) throw new BadRequestException("밴드 양끝이 모두 무제한이면 항상 참 — 알람 불가");
            if (lowerPct != null && upperPct != null && lowerPct >= upperPct) throw new BadRequestException("band 하단% < 상단% 이어야 함");
            // baseline = 세팅 시점가: 서버 시세(현재가) → 클라 폴백(방금 승격해 아직 미폴링) 순.
            const quote = this.engine.store.quotes.get(body.code);
            const baseline = quote?.price ?? body.baseline;
            if (baseline == null || !Number.isFinite(baseline) || baseline <= 0) {
                throw new ConflictException("아직 시세가 없어 baseline 해소 불가 — 다음 틱(≤5초) 후 재시도하거나 baseline 을 보내세요");
            }
            band = { baseline, lowerPct, upperPct };
        }

        let rank: RankCondition | undefined;
        if (body.rank) {
            const { theme, mode, threshold } = body.rank;
            if (!theme?.trim()) throw new BadRequestException("rank.theme 필요");
            if (mode !== "reach" && mode !== "delta") throw new BadRequestException("rank.mode 는 reach|delta");
            if (!Number.isInteger(threshold) || (threshold as number) < 1) throw new BadRequestException("rank.threshold 는 1 이상 정수");
            rank = { theme: theme.trim(), mode, threshold: threshold as number };
        }

        if (body.cooldownMs != null && (!Number.isFinite(body.cooldownMs) || body.cooldownMs < 0)) {
            throw new BadRequestException("cooldownMs 는 0 이상");
        }

        return this.config.addRule({
            code: body.code,
            band,
            rank,
            cooldownMs: body.cooldownMs,
            note: body.note?.trim() || undefined,
        });
    }

    @Delete("alerts/:id")
    removeRule(@Param("id") id: string): void {
        if (!this.config.removeRule(id)) throw new NotFoundException(`룰 없음: ${id}`);
    }
}
