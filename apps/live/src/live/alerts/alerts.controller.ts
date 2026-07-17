// watchlist·알람 규칙 REST — 패널이 폴링·편집. 계약은 contracts/wire(alerts.ts), 술어 해석은 core 레지스트리.
//  GET    /watchlist            전체 뷰(codes + code 스코프 규칙 + runtime state + 현재 순위)
//  GET    /alerts/log?since=N   발화 로그 증분(억제분 포함) — 워크벤치 로그 패널이 커서로 누적
//  POST   /watchlist {code}     타겟 승격
//  DELETE /watchlist/:code      타겟 해제(그 종목 스코프 규칙 연쇄 삭제)
//  POST   /alerts {code,predicates,cooldownMs?,name?,output?}  집중 감시 규칙 추가(predicates=AND)
//  DELETE /alerts/:id           규칙 삭제(스코프 무관)
//  GET    /universe             유니버스(스코프 없는) 규칙 + 블랙리스트
//  PUT    /universe/rules       유니버스 규칙 전체 교체(스코프 규칙은 보존)
//  POST   /universe/blacklist   {code,scope?} — 당일 블랙리스트(telegram=텔레그램만/all=로그까지)
//  DELETE /universe/blacklist/:code
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import { boardPredicateDef, predicateAvailable, LIVE_ALARM_FIELDS } from "@trade-data-manager/market/domain";
import type { AlarmPredicateInstance, AlarmRule, AlertLogView, UniverseView, WatchlistView } from "./types.js";
import { AlertConfigStore } from "./configStore.js";
import type { AlertsRuntime } from "./alertsRuntime.js";
import { ALERT_CONFIG, ALERTS } from "../tokens.js";

const CODE_RE = /^\d{6}$/;

function assertCode(code?: string): asserts code is string {
    if (!code || !CODE_RE.test(code)) throw new BadRequestException("code 형식(6자리 숫자)");
}

// ── 규칙 검증 — 술어 kind 는 core 레지스트리에 있고 알람 소스(LIVE_ALARM_FIELDS)에서 가용해야. ──

function parsePredicate(raw: unknown, at: string): AlarmPredicateInstance {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.kind !== "string") throw new BadRequestException(`${at}.kind 필요`);
    const def = boardPredicateDef(o.kind);
    if (!def) throw new BadRequestException(`${at}.kind 미등록 술어: ${o.kind}`);
    if (!predicateAvailable(def, LIVE_ALARM_FIELDS)) throw new BadRequestException(`${at}.kind '${o.kind}' 는 알람에서 사용 불가(데이터 미제공)`);
    const params: Record<string, number> = {};
    const rawParams = (o.params ?? {}) as Record<string, unknown>;
    for (const spec of def.params) {
        const v = rawParams[spec.key] ?? spec.def;
        if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequestException(`${at}.params.${spec.key} 는 숫자`);
        if (spec.min != null && v < spec.min) throw new BadRequestException(`${at}.params.${spec.key} ≥ ${spec.min}`);
        if (spec.max != null && v > spec.max) throw new BadRequestException(`${at}.params.${spec.key} ≤ ${spec.max}`);
        params[spec.key] = v;
    }
    let textParams: Record<string, string> | undefined;
    if (def.textParams?.length) {
        textParams = {};
        const rawTexts = (o.textParams ?? {}) as Record<string, unknown>;
        for (const spec of def.textParams) {
            const v = rawTexts[spec.key];
            if (typeof v !== "string" || !v.trim()) throw new BadRequestException(`${at}.textParams.${spec.key}(${spec.label}) 필요`);
            textParams[spec.key] = v.trim();
        }
    }
    return { kind: o.kind, params, ...(textParams ? { textParams } : {}) };
}

function parsePredicates(raw: unknown, at: string): AlarmPredicateInstance[] {
    if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException(`${at} 는 최소 1개`);
    return raw.map((p, i) => parsePredicate(p, `${at}[${i}]`));
}

function parseCooldownMs(v: unknown, at: string): number | undefined {
    if (v == null) return undefined;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new BadRequestException(`${at} 는 0 이상`);
    return v;
}

function parseUniverseRule(raw: unknown, i: number): Omit<AlarmRule, "id" | "code"> & { id?: string } {
    const at = `rules[${i}]`;
    const o = (raw ?? {}) as Record<string, unknown>;
    if (o.output !== "telegram" && o.output !== "log") throw new BadRequestException(`${at}.output 은 telegram|log`);
    if (o.cooldownKey != null && o.cooldownKey !== "code" && o.cooldownKey !== "codeRule") throw new BadRequestException(`${at}.cooldownKey 는 code|codeRule`);
    return {
        id: typeof o.id === "string" ? o.id : undefined,
        name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined,
        predicates: parsePredicates(o.predicates, `${at}.predicates`),
        output: o.output,
        cooldownKey: o.cooldownKey as AlarmRule["cooldownKey"],
        cooldownMs: parseCooldownMs(o.cooldownMs, `${at}.cooldownMs`),
    };
}

/** 다음 KST 자정(epoch ms) — 블랙리스트 당일 만료. 한국은 DST 없음이라 고정 +9h 시프트로 충분. */
function kstEndOfDay(now: number): number {
    const KST = 9 * 3_600_000;
    return Math.floor((now + KST) / 86_400_000 + 1) * 86_400_000 - KST;
}

interface CreateRuleBody {
    code?: string;
    predicates?: unknown;
    cooldownMs?: unknown;
    name?: string;
    output?: unknown;
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

    /** 발화 로그 증분 — since 초과분만. 생략/0 이면 서버 보유분 전체(패널 첫 로드). */
    @Get("alerts/log")
    log(@Query("since") since?: string): AlertLogView {
        const n = since == null || since === "" ? 0 : Number(since);
        if (!Number.isInteger(n) || n < 0) throw new BadRequestException("since 는 0 이상 정수(seq)");
        return this.alerts.logSince(n);
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

    /** 집중 감시 규칙 추가 — code 스코프. output 생략=telegram(기존 watchlist 의미). */
    @Post("alerts")
    addRule(@Body() body: CreateRuleBody): AlarmRule {
        assertCode(body.code);
        if (body.output != null && body.output !== "telegram" && body.output !== "log") throw new BadRequestException("output 은 telegram|log");
        return this.config.addAlarm({
            code: body.code,
            predicates: parsePredicates(body.predicates, "predicates"),
            cooldownMs: parseCooldownMs(body.cooldownMs, "cooldownMs"),
            name: body.name?.trim() || undefined,
            output: (body.output as AlarmRule["output"]) ?? "telegram",
        });
    }

    @Delete("alerts/:id")
    removeRule(@Param("id") id: string): void {
        if (!this.config.removeAlarm(id)) throw new NotFoundException(`조건 없음: ${id}`);
    }

    // ── 유니버스 조건검색 알람 ──

    @Get("universe")
    universe(): UniverseView {
        return { rules: [...this.config.universeRules], blacklist: [...this.config.activeBlacklist(Date.now())] };
    }

    /** 유니버스 규칙 전체 교체 — 클라가 편집한 목록을 통째로 저장. code 스코프 규칙은 보존. */
    @Put("universe/rules")
    setUniverseRules(@Body() body: { rules?: unknown }): AlarmRule[] {
        if (!Array.isArray(body.rules)) throw new BadRequestException("rules 배열 필요");
        return this.config.setUniverseRules(body.rules.map(parseUniverseRule));
    }

    /** 당일 블랙리스트 — scope: telegram(기본)=텔레그램만 차단(로그엔 남음) / all=로그조차 안 남김. KST 자정 자동 만료. */
    @Post("universe/blacklist")
    addBlacklist(@Body() body: { code?: string; scope?: string }): { code: string; until: number; scope?: "telegram" | "all" } {
        assertCode(body.code);
        const scope = body.scope ?? "telegram";
        if (scope !== "telegram" && scope !== "all") throw new BadRequestException("scope 는 telegram|all");
        const now = Date.now();
        return this.config.addBlacklist(body.code, kstEndOfDay(now), now, scope);
    }

    @Delete("universe/blacklist/:code")
    removeBlacklist(@Param("code") code: string): void {
        assertCode(code);
        this.config.removeBlacklist(code);
    }
}
