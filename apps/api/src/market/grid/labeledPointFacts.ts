// LabeledPointFacts — 그룹 배정 좌표(라벨=타점)의 봉 사실(종가·고가, 원주가 UN 원 단위)을 즉석 계산 +
// 상주 메모로 서빙한다. 규칙: .claude/decisions.md 「구조 개편」 A1.
//
// **파일 캐시를 안 만든 이유**: 값 두 개짜리에 대사·지문·GC·버전·gen 가드 기계를 한 벌 더 만들게 된다
// (격자가 그걸 다 갖는 이유는 6,016차트 × 수만 사건 봉이라서). 좌표 사실은 재료(분봉) 수리 전까지
// 불변이라 좌표당 메모면 충분하고, 비용 = 메모 미스 좌표를 가진 차트 수 × 분봉 1회 읽기(첫 요청뿐).
// 파일을 쓰지도 지우지도 않으므로 gen 가드도 없다 — 대신 라벨 집합 밖 키는 매 요청 때 메모에서 턴다.
//
// **봉 우주 = 격자와 같은 자**(gridSessionBars — 세션 창 필터 뒤 densify): 라벨이 격자 사건 봉과 겹치면
// 값이 격자 파생과 비트 일치해야 한다(두 출처가 갈리면 같은 행의 축과 결과가 다른 자를 쓴다).
// 세션 창 밖 좌표는 결손(항목 없음) — 지어내지 않는다.
import {
    gridSessionBars,
    hmsToMinute,
    kstToday,
    mapWithConcurrency,
    pointKeyOf,
    type AxisDeps,
    type GridDetectOptions,
    type GroupReader,
} from "@trade-data-manager/market";
import type { LabeledPointFact, LabeledPointFactBundle } from "@trade-data-manager/wire";

/** (종목,날) 동시 읽기 상한 — 격자 굽기와 같은 이유(커넥션 풀 포화 방지). */
const READ_CONCURRENCY = 8;
/** 분봉 미수집 차트의 재조회 억제 창 — 수집이 채워지면 자가치유되도록 오래 들지 않는다(격자와 같은 값). */
const MATERIAL_MISSING_TTL_MS = 10 * 60_000;

export interface LabeledPointFactsDeps {
    deps: Pick<AxisDeps, "minute">;
    groups: Pick<GroupReader, "listAllPointMemberships">;
    /** 세션 창 파라미터 — 격자(PointGrids)와 같은 값을 주입해야 봉 우주가 갈리지 않는다. */
    detect?: GridDetectOptions;
    today?: () => string;
    now?: () => number;
}

export class LabeledPointFacts {
    /** 좌표 키 → 사실(양성만 — 불변이라 무기한). */
    private readonly memo = new Map<string, { close: number; high: number }>();
    /** 좌표 키 → 결손 기록 시각(ms) — 봉 우주에 그 분이 없음(세션 창 밖·부분 수집). **TTL 음성**이다:
     *  영구로 굳히면 분봉 백필이 그 분을 채워도 프로세스 재시작 전까지 영영 pending 이다(자가치유 원칙).
     *  세션 창 밖 좌표는 TTL 마다 차트 1회 재조회를 무는데, 드문 상태라 감수한다(리뷰 A-1). */
    private readonly coordMissAt = new Map<string, number>();
    /** 분봉 0건 차트(미수집) — 차트키 → 기록 시각(ms). TTL 뒤 재시도(자가치유). */
    private readonly missingAt = new Map<string, number>();
    /** in-flight 공유 — 동시 요청이 같은 미스 집합을 각자 읽지 않게(PointGrids 와 같은 이유, 리뷰 A-2). */
    private inFlight: Promise<LabeledPointFactBundle> | null = null;
    /** invalidate 세대 — 라벨 편집 **전에** 시작된 비행에 편집 **후** 요청이 합류해 새 라벨이 빠진
     *  번들이 IMMUTABLE 캐시에 굳는 사고 방지(PointGrids.bundle 의 gen 재시도와 같은 처방). */
    private gen = 0;

    constructor(private readonly cfg: LabeledPointFactsDeps) {}

    /** 라벨 편집 직후 호출(그룹 컨트롤러) — 진행 중 비행에 이후 요청이 합류하지 않게. */
    invalidate(): void {
        this.gen++;
        this.inFlight = null;
    }

    async bundle(): Promise<LabeledPointFactBundle> {
        // 비행 중 gen 이 밀렸으면(라벨 편집) 그 비행은 편집 전 라벨 목록을 읽었다 — 한 번 더 돈다.
        // 상한 3회(편집 폭주 중엔 어차피 곧 새 요청이 온다 — 무한 재시도 금지). 메모 자체는 좌표 불변값이라
        // 낡은 비행의 기록도 값은 옳다 — 낡을 수 있는 건 응답의 라벨 **목록**뿐이고, 그걸 재시도가 고친다.
        let out: LabeledPointFactBundle = { facts: [] };
        for (let i = 0; i < 3; i++) {
            const g = this.gen;
            let p = this.inFlight;
            if (!p) {
                const run = this.doBundle().finally(() => {
                    if (this.inFlight === run) this.inFlight = null;
                });
                this.inFlight = run;
                p = run;
            }
            out = await p;
            if (g === this.gen) break;
        }
        return out;
    }

    private async doBundle(): Promise<LabeledPointFactBundle> {
        const today = (this.cfg.today ?? kstToday)();
        const nowMs = (this.cfg.now ?? Date.now)();
        const labels = (await this.cfg.groups.listAllPointMemberships()).filter((m) => m.date < today);

        // 라벨 집합 밖 키 청소 — 라벨 해제·그룹 삭제로 빠진 좌표·차트의 메모가 영원히 쌓이지 않게
        // (missingAt 도 함께 턴다 — 해제 전의 TTL 딱지가 재라벨 첫 요청을 건너뛰게 하면 안 된다, 리뷰 A-3).
        const wanted = new Set(labels.map((m) => pointKeyOf(m)));
        const wantedCharts = new Set(labels.map((m) => `${m.stockCode}|${m.date}`));
        for (const k of this.memo.keys()) if (!wanted.has(k)) this.memo.delete(k);
        for (const k of this.coordMissAt.keys()) if (!wanted.has(k)) this.coordMissAt.delete(k);
        for (const k of this.missingAt.keys()) if (!wantedCharts.has(k)) this.missingAt.delete(k);

        // 메모 미스 좌표를 차트별로 묶는다 — 분봉 읽기는 차트당 1회.
        const missByChart = new Map<string, { stockCode: string; date: string; times: string[] }>();
        for (const m of labels) {
            const key = pointKeyOf(m);
            if (this.memo.has(key)) continue;
            const coordMissed = this.coordMissAt.get(key);
            if (coordMissed !== undefined && nowMs - coordMissed < MATERIAL_MISSING_TTL_MS) continue;
            const ck = `${m.stockCode}|${m.date}`;
            const missedAt = this.missingAt.get(ck);
            if (missedAt !== undefined && nowMs - missedAt < MATERIAL_MISSING_TTL_MS) continue;
            const g = missByChart.get(ck);
            if (g) g.times.push(m.time);
            else missByChart.set(ck, { stockCode: m.stockCode, date: m.date, times: [m.time] });
        }

        await mapWithConcurrency([...missByChart.values()], READ_CONCURRENCY, async (c) => {
            const minutes = await this.cfg.deps.minute.getMinuteCandles(c.stockCode, c.date);
            const bars = gridSessionBars(minutes, this.cfg.detect);
            if (bars.length === 0) {
                this.missingAt.set(`${c.stockCode}|${c.date}`, nowMs);
                return;
            }
            this.missingAt.delete(`${c.stockCode}|${c.date}`);
            const byMin = new Map(bars.map((b) => [hmsToMinute(b.time), b] as const));
            for (const time of c.times) {
                const bar = byMin.get(hmsToMinute(time));
                const key = pointKeyOf({ stockCode: c.stockCode, date: c.date, time });
                if (bar) {
                    this.memo.set(key, { close: Number(bar.un.close), high: Number(bar.un.high) });
                    this.coordMissAt.delete(key);
                } else {
                    this.coordMissAt.set(key, nowMs);
                }
            }
        });

        const facts: LabeledPointFact[] = [];
        for (const m of labels) {
            const f = this.memo.get(pointKeyOf(m));
            if (f) facts.push({ stockCode: m.stockCode, date: m.date, time: m.time, close: f.close, high: f.high });
        }
        return { facts };
    }
}
