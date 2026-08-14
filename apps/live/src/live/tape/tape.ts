// 장중 테마 테이프 — framework-free. 엔진이 3초 틱마다 이미 손에 든 시세(ka10095)를 분당 1점으로
// 접어 하루치로 쌓는다(추가 API 0). 폴링을 늘리는 물건이 아니라 **버리던 것을 버리지 않는** 물건이다.
//
// ## 세 가지 축
//  · 종목 시계열: 분 → {price(UN 현재가), cumAmount(누적 거래대금 원)}. 틱은 last-wins(그 분의 마지막
//    샘플이 종가 노릇). 오차 = 마지막 샘플 이후 최대 폴 주기(3초)어치 — 선 그리기엔 무해.
//  · 전역 틱 비트맵: 엔진이 틱을 돈 분들. 종목 결손과 교차하면 "조건 이탈"(틱 있음+샘플 없음)과
//    "기계 결손"(틱 없음)이 결정적으로 갈린다 — 클라 회색띠의 근거.
//  · 백필(머리 채움): 편입 시점 이전(09:00~지금)은 틱으로 못 얻으니 분봉 REST 1회로 메운다.
//    (code,날짜)당 1회 — 이탈 후 재진입엔 아무것도 안 한다(구멍 = 조건 이탈의 기록, 사용자 확정).
//    수동 재백필(requestBackfill force)만 구멍을 메운다.
//
// ## rev(백필 세대)
// 과거 분이 채워지는 건 백필뿐이다. 클라 델타(since=보유 최대 분)는 rev 일치를 전제로 하고,
// 백필이 완료될 때마다 rev 를 올려 클라가 풀 재요청하게 한다.
//
// ## 시계
// now(ms)·today(YYYY-MM-DD)는 전부 호출자 주입(엔진 틱·컨트롤러) — 테스트는 가짜 시각.
import type { MinuteCandle } from "@trade-data-manager/market";
import { computeMinuteTradingAmount, densifyMinutes, minuteOfDayOf } from "@trade-data-manager/market";
import type { TapeSink } from "../engine/engine.js";
import type { Quote } from "../engine/types.js";

/** 백필 실패 후 재시도 대기(ms) — 키움 일시 장애에 큐가 폭주하지 않게. */
const RETRY_MS = 60_000;
/**
 * 기록 창(벽시계 분) — 08:00(NXT 프리마켓)~16:00. 엔진은 밤에도 돌고 ka10095 는 장외에도 마지막
 * 체결가를 돌려주므로(2026-08-15 새벽 실측: ticks 에 00:17 이 찍힘), 창 없이 받으면 밤새 평평한
 * 가짜 샘플이 쌓여 아침 패널의 x 축이 00:00 부터 시작한다. 창 밖 틱은 날짜 롤오버만 하고 버린다.
 */
const SESSION_FROM = 8 * 60;
const SESSION_TO = 16 * 60;
/** Quote.tradeValue 단위(백만원) → 원. 복기 cumAmount(원)와 단위 통일. */
const MILLION = 1_000_000;

/** 테이프가 분봉 백필에 요구하는 최소 표면(= market MinuteCandleProvider). 테스트는 스텁 주입. */
export interface TapeMinuteSource {
    getMinuteCandles(stockCode: string, date: string): Promise<MinuteCandle[]>;
}

interface Sample {
    price: number; // UN 현재가(원)
    cumAmount: number; // 누적 거래대금(원)
}

interface TapeEntry {
    name: string;
    samples: Map<number, Sample>; // 벽시계 분 → 샘플
}

/** 정렬된 분·값 평행 배열(직렬화 직전 모양 — %는 컨트롤러가 base 로 계산). */
export interface TapeSeries {
    code: string;
    name: string;
    minutes: number[];
    price: number[];
    cumAmount: number[];
}

/** "HH:MM:SS" → 벽시계 분. */
const minuteOfTime = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export class LiveTape implements TapeSink {
    private date = ""; // 현재 테이프 날짜 — 바뀌면 전체 리셋(장 마감 후 다음 거래일)
    private revCount = 0;
    private readonly entries = new Map<string, TapeEntry>();
    private readonly tickMinutes = new Set<number>();
    private readonly ensured = new Set<string>(); // 오늘 백필 완료(또는 진행 예약)된 코드
    private readonly failedAt = new Map<string, number>(); // 백필 실패 시각 → RETRY_MS 백오프
    private readonly queue: Array<{ code: string; today: string; now: number }> = [];
    private draining = false;

    constructor(
        private readonly minutes: TapeMinuteSource,
        private readonly onError: (msg: string) => void = (m) => console.warn(m),
    ) {}

    get rev(): number {
        return this.revCount;
    }

    get tapeDate(): string {
        return this.date;
    }

    /**
     * 엔진 틱 결합점 하나 — 비트맵 마킹 + 시세 접기 + 백필 예약(멱등). 엔진은 이 한 줄만 안다.
     * 날짜가 바뀌면 테이프를 통째로 새로 시작한다(어제 테이프는 복기 파이프라인 소관).
     */
    onTick(quotes: readonly Quote[], now: number, today: string): void {
        this.rollover(today); // 창 밖에서도 날짜는 굴린다 — 자정 지나면 어제 테이프를 비워야 한다
        const minute = minuteOfDayOf(Math.floor(now / 1000));
        if (minute < SESSION_FROM || minute >= SESSION_TO) return; // 장외 스냅샷은 관찰이 아니다
        this.tickMinutes.add(minute);
        for (const q of quotes) {
            const e = this.entries.get(q.code);
            if (e) {
                e.name = q.name || e.name;
                e.samples.set(minute, { price: q.price, cumAmount: q.tradeValue * MILLION });
            } else {
                this.entries.set(q.code, { name: q.name, samples: new Map([[minute, { price: q.price, cumAmount: q.tradeValue * MILLION }]]) });
            }
            this.requestBackfill(q.code, today, now, false);
        }
    }

    /**
     * 백필 예약 — force=false 는 (code,날짜)당 1회(재진입 무시 = 구멍 보존), force=true 는 수동 메우기.
     * 실패 코드는 RETRY_MS 백오프 후에만 재예약. 큐는 직렬 소화 — 분봉 TR(ka10080)이 차트 폴링과
     * 같은 레이트 버킷이라, 편입 러시(부팅 직후 수십 코드)에 차트를 굶기지 않게 한 번에 하나씩.
     */
    requestBackfill(code: string, today: string, now: number, force: boolean): void {
        this.rollover(today);
        if (!force) {
            if (this.ensured.has(code)) return;
            const failed = this.failedAt.get(code);
            if (failed != null && now - failed < RETRY_MS) return;
        }
        if (this.queue.some((j) => j.code === code)) return;
        this.ensured.add(code); // 예약 = 착수 표시(성공/실패는 소화 시 갱신)
        this.queue.push({ code, today, now });
        void this.drain();
    }

    /** 테마 필터로 직렬화 — 분 오름차순 평행 배열. sinceMinute 주면 그 분 **포함** 이후만(형성 중 분 재전송). */
    view(codeFilter: (code: string) => boolean, sinceMinute: number | null): { ticks: number[]; stocks: TapeSeries[] } {
        const cut = sinceMinute ?? -1;
        const ticks = [...this.tickMinutes].filter((m) => m >= cut).sort((a, b) => a - b);
        const stocks: TapeSeries[] = [];
        for (const [code, e] of this.entries) {
            if (!codeFilter(code)) continue;
            const minutes = [...e.samples.keys()].filter((m) => m >= cut).sort((a, b) => a - b);
            if (minutes.length === 0) continue;
            const price = new Array<number>(minutes.length);
            const cumAmount = new Array<number>(minutes.length);
            for (let i = 0; i < minutes.length; i++) {
                const s = e.samples.get(minutes[i])!;
                price[i] = s.price;
                cumAmount[i] = s.cumAmount;
            }
            stocks.push({ code, name: e.name, minutes, price, cumAmount });
        }
        return { ticks, stocks };
    }

    private rollover(today: string): void {
        if (this.date === today) return;
        this.date = today;
        this.revCount = 0;
        this.entries.clear();
        this.tickMinutes.clear();
        this.ensured.clear();
        this.failedAt.clear();
        this.queue.length = 0;
    }

    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;
        try {
            for (;;) {
                const job = this.queue.shift();
                if (!job) return;
                if (job.today !== this.date) continue; // 롤오버로 무의미해진 작업
                try {
                    await this.backfill(job.code, job.today, minuteOfDayOf(Math.floor(job.now / 1000)));
                    this.failedAt.delete(job.code);
                    this.revCount++; // 과거가 채워졌다 — 클라 풀 재요청 신호
                } catch (e) {
                    this.ensured.delete(job.code); // 다음 틱의 requestBackfill 이 백오프 후 재예약
                    // 시계는 전부 호출자 주입(now) — Date.now() 를 섞으면 백오프 비교의 잣대가 갈린다.
                    this.failedAt.set(job.code, job.now);
                    this.onError(`[tape] ${job.code} 분봉 백필 실패(${RETRY_MS / 1000}s 후 재시도): ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        } finally {
            this.draining = false;
        }
    }

    /**
     * 머리 채움 — 오늘 분봉(공식)을 접어 넣는다. 지난 분은 공식 분봉이 정본이라 **덮어쓰고**,
     * 형성 중인 현재 분(nowMinute 이후)은 틱이 더 신선하므로 **비어 있을 때만** 채운다.
     * densifyMinutes 규칙(첫 봉~마지막 봉 사이 내부 갭만 직전 종가·거래량 0)이 복기와 같은 경계를 만든다.
     */
    private async backfill(code: string, today: string, nowMinute: number): Promise<void> {
        const raw = await this.minutes.getMinuteCandles(code, today);
        const dense = densifyMinutes(raw);
        if (dense.length === 0) return;
        const e = this.entries.get(code) ?? { name: code, samples: new Map<number, Sample>() };
        this.entries.set(code, e);
        let cum = 0n;
        for (const c of dense) {
            cum += BigInt(computeMinuteTradingAmount({ open: c.un.open, high: c.un.high, low: c.un.low, close: c.un.close, volume: c.un.volume }));
            const m = minuteOfTime(c.time);
            if (m < nowMinute || !e.samples.has(m)) e.samples.set(m, { price: Number(c.un.close), cumAmount: Number(cum) });
        }
    }
}
