// watchlist·알람조건 REST — 실시간 모니터링 패널이 폴링·편집. 계약은 contracts/wire(alerts.ts).
//  GET    /watchlist            전체 뷰(codes+조건+runtime state+최근 발화)
//  POST   /watchlist {code}     타겟 승격
//  DELETE /watchlist/:code      타겟 해제(그 종목 조건 연쇄 삭제)
//  POST   /alerts {code,groups,cooldownMs?,note?}  조건 추가(groups=DNF, 절대가격이라 baseline 해소 없음)
//  DELETE /alerts/:id           조건 삭제
import { Controller, Get, Post, Delete, Body, Param, Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import type { AlertGroup, AlertLeaf, AlertMarket, AlertOp, AlertRule, WatchlistView } from "./types.js";
import { AlertConfigStore } from "./configStore.js";
import type { AlertsRuntime } from "./alertsRuntime.js";
import { ALERT_CONFIG, ALERTS } from "../tokens.js";

const CODE_RE = /^\d{6}$/;

interface CreateRuleBody {
    code?: string;
    groups?: unknown; // parseGroups 에서 형태 검증
    cooldownMs?: number;
    note?: string;
}

function assertCode(code?: string): asserts code is string {
    if (!code || !CODE_RE.test(code)) throw new BadRequestException("code 형식(6자리 숫자)");
}

function parseOp(v: unknown, at: string): AlertOp {
    if (v !== "gte" && v !== "lte") throw new BadRequestException(`${at}.op 는 gte|lte`);
    return v;
}
function parseMarket(v: unknown, at: string): AlertMarket {
    if (v !== "krx" && v !== "un") throw new BadRequestException(`${at}.market 는 krx|un`);
    return v;
}

/** leaf 하나 검증 → 정규화된 AlertLeaf(정합하지 않으면 400). */
function parseLeaf(raw: unknown, gi: number, li: number): AlertLeaf {
    const at = `groups[${gi}].leaves[${li}]`;
    const o = (raw ?? {}) as Record<string, unknown>;
    if (o.kind === "price") {
        const op = parseOp(o.op, at);
        if (typeof o.value !== "number" || !Number.isFinite(o.value) || o.value <= 0) throw new BadRequestException(`${at}.value 는 0 초과 숫자(원)`);
        return { kind: "price", op, value: o.value };
    }
    if (o.kind === "rate") {
        const op = parseOp(o.op, at);
        if (typeof o.pct !== "number" || !Number.isFinite(o.pct)) throw new BadRequestException(`${at}.pct 는 숫자(%)`);
        return { kind: "rate", op, pct: o.pct, market: parseMarket(o.market, at) };
    }
    if (o.kind === "rank") {
        const theme = typeof o.theme === "string" ? o.theme.trim() : "";
        if (!theme) throw new BadRequestException(`${at}.theme 필요`);
        if (o.mode !== "reach" && o.mode !== "delta") throw new BadRequestException(`${at}.mode 는 reach|delta`);
        if (!Number.isInteger(o.threshold) || (o.threshold as number) < 1) throw new BadRequestException(`${at}.threshold 는 1 이상 정수`);
        return { kind: "rank", theme, market: parseMarket(o.market, at), mode: o.mode, threshold: o.threshold as number };
    }
    throw new BadRequestException(`${at}.kind 는 price|rate|rank`);
}

/** groups(DNF) 검증 → 정규화. 최소 1그룹, 각 그룹 최소 1 leaf. */
function parseGroups(raw: unknown): AlertGroup[] {
    if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException("groups 는 최소 1개 필요");
    return raw.map((g, gi) => {
        const leaves = (g as { leaves?: unknown } | null)?.leaves;
        if (!Array.isArray(leaves) || leaves.length === 0) throw new BadRequestException(`groups[${gi}].leaves 는 최소 1개 필요`);
        return { leaves: leaves.map((leaf, li) => parseLeaf(leaf, gi, li)) };
    });
}

@Controller()
export class AlertsController {
    constructor(
        @Inject(ALERT_CONFIG) private readonly config: AlertConfigStore,
        @Inject(ALERTS) private readonly alerts: AlertsRuntime,
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
        const groups = parseGroups(body.groups);
        if (body.cooldownMs != null && (!Number.isFinite(body.cooldownMs) || body.cooldownMs < 0)) {
            throw new BadRequestException("cooldownMs 는 0 이상");
        }
        return this.config.addRule({
            code: body.code,
            groups,
            cooldownMs: body.cooldownMs,
            note: body.note?.trim() || undefined,
        });
    }

    @Delete("alerts/:id")
    removeRule(@Param("id") id: string): void {
        if (!this.config.removeRule(id)) throw new NotFoundException(`조건 없음: ${id}`);
    }
}
