// watchlist·알람조건 REST — 실시간 모니터링 패널이 폴링·편집. 계약은 contracts/wire(alerts.ts).
//  GET    /watchlist            전체 뷰(codes+조건+runtime state+현재 순위)
//  GET    /alerts/log?since=N   발화 로그 증분(억제분 포함) — 워크벤치 로그 패널이 커서로 누적
//  POST   /watchlist {code}     타겟 승격
//  DELETE /watchlist/:code      타겟 해제(그 종목 조건 연쇄 삭제)
//  POST   /alerts {code,leaves,cooldownMs?,note?}  조건 추가(leaves=AND, 절대가격이라 baseline 해소 없음)
//  DELETE /alerts/:id           조건 삭제
//  GET    /universe             유니버스 조건검색 설정(규칙+블랙리스트)
//  PUT    /universe/rules       규칙 전체 교체(술어 kind 는 core 레지스트리 + LIVE_ALARM_FIELDS 검증)
//  POST   /universe/blacklist   {code} — 당일 만료 블랙리스트(유니버스 텔레그램만 차단, 로그엔 남음)
//  DELETE /universe/blacklist/:code
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject, BadRequestException, NotFoundException } from "@nestjs/common";
import { boardPredicateDef, predicateAvailable, LIVE_ALARM_FIELDS } from "@trade-data-manager/market/domain";
import type { AlertLeaf, AlertLogView, AlertMarket, AlertOp, AlertRule, UniversePredicateInstance, UniverseRule, UniverseView, WatchlistView } from "./types.js";
import { AlertConfigStore } from "./configStore.js";
import type { AlertsRuntime } from "./alertsRuntime.js";
import { ALERT_CONFIG, ALERTS } from "../tokens.js";

const CODE_RE = /^\d{6}$/;

interface CreateRuleBody {
    code?: string;
    leaves?: unknown; // parseLeaves 에서 형태 검증
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
function parseLeaf(raw: unknown, i: number): AlertLeaf {
    const at = `leaves[${i}]`;
    const o = (raw ?? {}) as Record<string, unknown>;
    if (o.kind === "price") {
        const op = parseOp(o.op, at);
        if (typeof o.value !== "number" || !Number.isFinite(o.value) || o.value <= 0) throw new BadRequestException(`${at}.value 는 0 초과 숫자(원)`);
        return { kind: "price", op, value: o.value };
    }
    if (o.kind === "rank") {
        const theme = typeof o.theme === "string" ? o.theme.trim() : "";
        if (!theme) throw new BadRequestException(`${at}.theme 필요`);
        if (o.mode !== "reach" && o.mode !== "delta") throw new BadRequestException(`${at}.mode 는 reach|delta`);
        if (!Number.isInteger(o.threshold) || (o.threshold as number) < 1) throw new BadRequestException(`${at}.threshold 는 1 이상 정수`);
        return { kind: "rank", theme, market: parseMarket(o.market, at), mode: o.mode, threshold: o.threshold as number };
    }
    throw new BadRequestException(`${at}.kind 는 price|rank`);
}

/** leaves(AND) 검증 → 정규화. 최소 1개. */
function parseLeaves(raw: unknown): AlertLeaf[] {
    if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException("leaves 는 최소 1개 필요");
    return raw.map((leaf, i) => parseLeaf(leaf, i));
}

// ── 유니버스 규칙 검증 — 술어 kind 는 core 레지스트리에 있고 알람 소스(LIVE_ALARM_FIELDS)에서 가용해야. ──

function parseUniversePredicate(raw: unknown, at: string): UniversePredicateInstance {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof o.kind !== "string") throw new BadRequestException(`${at}.kind 필요`);
    const def = boardPredicateDef(o.kind);
    if (!def) throw new BadRequestException(`${at}.kind 미등록 술어: ${o.kind}`);
    if (!predicateAvailable(def, LIVE_ALARM_FIELDS)) throw new BadRequestException(`${at}.kind '${o.kind}' 는 유니버스 알람에서 사용 불가(데이터 미제공)`);
    const params: Record<string, number> = {};
    const rawParams = (o.params ?? {}) as Record<string, unknown>;
    for (const spec of def.params) {
        const v = rawParams[spec.key] ?? spec.def;
        if (typeof v !== "number" || !Number.isFinite(v)) throw new BadRequestException(`${at}.params.${spec.key} 는 숫자`);
        if (spec.min != null && v < spec.min) throw new BadRequestException(`${at}.params.${spec.key} ≥ ${spec.min}`);
        if (spec.max != null && v > spec.max) throw new BadRequestException(`${at}.params.${spec.key} ≤ ${spec.max}`);
        params[spec.key] = v;
    }
    return { kind: o.kind, params };
}

function parseUniverseRule(raw: unknown, i: number): Omit<UniverseRule, "id"> & { id?: string } {
    const at = `rules[${i}]`;
    const o = (raw ?? {}) as Record<string, unknown>;
    if (o.output !== "telegram" && o.output !== "log") throw new BadRequestException(`${at}.output 은 telegram|log`);
    if (!Array.isArray(o.predicates) || o.predicates.length === 0) throw new BadRequestException(`${at}.predicates 는 최소 1개`);
    if (o.cooldownKey != null && o.cooldownKey !== "code" && o.cooldownKey !== "codeRule") throw new BadRequestException(`${at}.cooldownKey 는 code|codeRule`);
    if (o.cooldownMs != null && (typeof o.cooldownMs !== "number" || !Number.isFinite(o.cooldownMs) || o.cooldownMs < 0)) throw new BadRequestException(`${at}.cooldownMs 는 0 이상`);
    return {
        id: typeof o.id === "string" ? o.id : undefined,
        name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined,
        predicates: o.predicates.map((p, pi) => parseUniversePredicate(p, `${at}.predicates[${pi}]`)),
        output: o.output,
        cooldownKey: o.cooldownKey as UniverseRule["cooldownKey"],
        cooldownMs: o.cooldownMs as number | undefined,
    };
}

/** 다음 KST 자정(epoch ms) — 블랙리스트 당일 만료. 한국은 DST 없음이라 고정 +9h 시프트로 충분. */
function kstEndOfDay(now: number): number {
    const KST = 9 * 3_600_000;
    return Math.floor((now + KST) / 86_400_000 + 1) * 86_400_000 - KST;
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

    @Post("alerts")
    addRule(@Body() body: CreateRuleBody): AlertRule {
        assertCode(body.code);
        const leaves = parseLeaves(body.leaves);
        if (body.cooldownMs != null && (!Number.isFinite(body.cooldownMs) || body.cooldownMs < 0)) {
            throw new BadRequestException("cooldownMs 는 0 이상");
        }
        return this.config.addRule({
            code: body.code,
            leaves,
            cooldownMs: body.cooldownMs,
            note: body.note?.trim() || undefined,
        });
    }

    @Delete("alerts/:id")
    removeRule(@Param("id") id: string): void {
        if (!this.config.removeRule(id)) throw new NotFoundException(`조건 없음: ${id}`);
    }

    // ── 유니버스 조건검색 알람 ──

    @Get("universe")
    universe(): UniverseView {
        return { rules: [...this.config.universeRules], blacklist: [...this.config.activeBlacklist(Date.now())] };
    }

    /** 규칙 전체 교체 — 클라가 편집한 목록을 통째로 저장(보드 필터와 같은 편집 모델). id 없는 규칙은 발급. */
    @Put("universe/rules")
    setUniverseRules(@Body() body: { rules?: unknown }): UniverseRule[] {
        if (!Array.isArray(body.rules)) throw new BadRequestException("rules 배열 필요");
        return this.config.setUniverseRules(body.rules.map(parseUniverseRule));
    }

    /** 당일 블랙리스트 — 유니버스 텔레그램만 차단(로그엔 남음, watchlist 감시 무관). KST 자정 자동 만료. */
    @Post("universe/blacklist")
    addBlacklist(@Body() body: { code?: string }): { code: string; until: number } {
        assertCode(body.code);
        const now = Date.now();
        return this.config.addBlacklist(body.code, kstEndOfDay(now), now);
    }

    @Delete("universe/blacklist/:code")
    removeBlacklist(@Param("code") code: string): void {
        assertCode(code);
        this.config.removeBlacklist(code);
    }
}
