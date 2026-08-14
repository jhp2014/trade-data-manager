// 장중 테마 테이프 서빙 — GET /tape (워크벤치는 /live 프록시 경유 → /live/tape).
// 테이프(가격 공간)를 여기서 %로 바꾼다: 분모 = 엔진 일봉 컨텍스트 basePrice.un(복기 deriveMinutes 와
// 같은 잣대). 기준가 미도착 종목은 싣지 않고 pending 으로 알린다(결손은 결손 — 그 선만 늦게 시작).
//
//   GET  /tape?theme=&since=&rev=   테마 멤버(오늘 테이프에 실린 것만)의 분당 시계열 + 틱 비트맵.
//                                   rev 일치 + since 있으면 델타(minute >= since), 아니면 풀.
//   POST /tape/backfill {code}      수동 메우기 — 조건 이탈 구멍을 보고 싶을 때만(force 재백필).
import { Controller, Get, Post, Body, Query, Inject, BadRequestException } from "@nestjs/common";
import { kstToday } from "@trade-data-manager/market";
import type { LiveTapeView, LiveTapeStock } from "@trade-data-manager/wire";
import { LIVE_ENGINE, LIVE_TAPE } from "../tokens.js";
import type { LiveEngine } from "../engine/engine.js";
import type { LiveTape } from "./tape.js";

const CODE_RE = /^\d{6}$/;
/** 소수 둘째 자리 반올림 — 복기 파생(r2)과 같은 정밀도. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

@Controller("tape")
export class TapeController {
    constructor(
        @Inject(LIVE_TAPE) private readonly tape: LiveTape,
        @Inject(LIVE_ENGINE) private readonly engine: LiveEngine,
    ) {}

    @Get()
    view(@Query("theme") theme?: string, @Query("since") sinceRaw?: string, @Query("rev") revRaw?: string): LiveTapeView {
        if (!theme) throw new BadRequestException("theme 필수");
        // 델타는 rev 일치가 전제 — 백필(과거 채움)이 있었으면 풀 응답으로 강등.
        const since = sinceRaw != null && sinceRaw !== "" ? Number(sinceRaw) : null;
        if (since !== null && (!Number.isInteger(since) || since < 0 || since > 1439)) throw new BadRequestException("since 범위(0~1439)");
        const rev = revRaw != null && revRaw !== "" ? Number(revRaw) : null;
        const delta = since !== null && rev === this.tape.rev ? since : null;

        const { ticks, stocks } = this.tape.view((code) => this.engine.themesOf(code).includes(theme), delta);
        const watched = this.engine.watchedSet();
        const out: LiveTapeStock[] = [];
        const pending: string[] = [];
        for (const s of stocks) {
            const base = this.engine.baseOf(s.code, "un");
            if (base == null || !(base > 0)) {
                pending.push(s.code);
                continue;
            }
            out.push({
                code: s.code,
                name: s.name,
                themes: this.engine.themesOf(s.code),
                ...(watched.has(s.code) ? { watched: true } : {}),
                minutes: s.minutes,
                rate: s.price.map((p) => r2((p / base - 1) * 100)),
                cumAmount: s.cumAmount,
            });
        }
        return { date: this.tape.tapeDate, rev: this.tape.rev, theme, since: delta, ticks, stocks: out, pending };
    }

    @Post("backfill")
    backfill(@Body() body: { code?: string }): { ok: true } {
        const code = body?.code;
        if (!code || !CODE_RE.test(code)) throw new BadRequestException("code 형식(6자리 숫자)");
        this.tape.requestBackfill(code, kstToday(), Date.now(), true);
        return { ok: true };
    }
}
