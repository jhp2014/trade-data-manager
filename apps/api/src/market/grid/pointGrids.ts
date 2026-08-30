// PointGrids — 자동 타점 격자를 대사(reconcile)로 유지하는 캐시. 규칙: .claude/decisions.md "자동 타점 격자" 절.
//
// 기대집합 = **기준선이 확정되는 앵커 차트 전부**(과거 날짜) — 현재 앵커(큐레이션 미러)가 진실.
// 요청마다 저장집합(파일)과 대조해 지문 불일치·누락 차트만 굽고, 참조 없는 날짜 파일은 GC 한다
// (RankSections 와 같은 대조 모델). 다르게 간 두 가지:
//
//  ① **굽기 게이트는 DerivedCache.isSealed 가 아니다** — 그건 "day-snapshot 파일 존재"라서(보드를 연 적
//    없는 날짜가 실측 280일 중 207일) 물려받으면 격자의 74%가 영원히 안 구워진다. 격자의 재료는
//    스냅샷이 아니라 분봉이므로 게이트 = `date < KST 오늘 ∧ 분봉 존재`. rankSections 를 본뜰 때
//    이 게이트만은 가져오지 말 것.
//  ② **기대집합 산정과 검출이 같은 기준선 정의를 본다** — dropSameDayAnchors(당일 캔들 기준선 배제,
//    사용자 확정) + resolveBaselines 승자. 한쪽만 거르면 "기대집합엔 있는데 검출은 항상 빈손"인 차트가
//    남아 매 대사마다 그 분봉을 다시 읽는 영구 루프가 된다.
//
// 재료 없음(분봉 0건·기준선 캔들 미수집)은 **안 굽는다**(무사건 격자와 다른 것) — 나중에 수집되면
// 자가치유되도록 항목을 만들지 않되, TTL 음성 메모로 대사마다의 재조회 폭주만 막는다.
//
// ⚠ 재료 수리(원주가 재작성·분봉 재백필)엔 자동 무효화가 없다 — 지문은 앵커 좌표만 본다.
//   처방은 계산 축과 동일: POINT_GRID_CALC_VERSION 상향 또는 캐시 삭제.
import {
    BASELINE_PARAM,
    candlePrice,
    chartKeyOf,
    detectGrid,
    dropSameDayAnchors,
    kstToday,
    mapWithConcurrency,
    rawScaleOf,
    resolveBaselines,
    type AxisDeps,
    type BaselineAnchor,
    type ChartAnchor,
    type ChartRef,
    type GridDetectOptions,
} from "@trade-data-manager/market";
import { anchorsFingerprint } from "../rank/axisFingerprint.js";
import type { GridStore, PointGridEntry } from "./gridStore.js";
import { POINT_GRID_FILE_VERSION } from "./gridStore.js";

/** 검출 규칙 버전 — 격자 스키마·검출 파라미터(2% zigzag·floor 20억·세션 창 08:00~15:30)가 바뀌면 올린다(전량 재굽기). */
export const POINT_GRID_CALC_VERSION = 1;

/** (종목,날) 동시 읽기 상한 — 축·리졸버와 같은 이유(커넥션 풀 포화 방지). */
const BAKE_CONCURRENCY = 8;

/** 재료 없음 차트의 재시도 억제 창 — 무기한이면 수집이 채워져도 안 굽고, 없으면 대사마다 재조회 폭주. */
const MATERIAL_MISSING_TTL_MS = 10 * 60_000;

export interface PointGridsDeps {
    deps: Pick<AxisDeps, "minute" | "rawDaily" | "adjDaily" | "chartAnchor">;
    store: GridStore;
    /** 검출 파라미터 — recon A/B 주입용. 기본값이 곧 CALC_VERSION 에 구워진 규칙이다. */
    detect?: GridDetectOptions;
    /** 오늘(KST) 공급자 — 테스트 주입용. */
    today?: () => string;
    /** 현재 시각(ms) 공급자 — 음성 메모 TTL 판정. 테스트 주입용. */
    now?: () => number;
}

export interface GridReconcileReport {
    /** 기대집합 크기(기준선 확정 차트, 과거 날짜). */
    charts: number;
    /** 이번 대사에서 새로 구운 차트. */
    baked: number;
    /** 지문 히트(분봉 읽기 0회). */
    kept: number;
    /** 재료 없음(분봉 0건·기준선 캔들 못 읽음) — 다음 대사에서 재시도. */
    materialMissing: ChartRef[];
    /** 기준선 후보 ≥2 인데 확정 불가(결손) — 기대집합 밖. */
    unresolved: number;
    /** 파일에서 걷어낸 차트 항목(기준선 삭제 등). */
    removedCharts: number;
    /** GC 로 지운 날짜 파일. */
    removedDates: number;
    tookMs: number;
}

export class PointGrids {
    private inFlight: Promise<GridReconcileReport> | null = null;
    /** 재료 없음 음성 메모 — 차트키 → 기록 시각(ms). */
    private readonly missingAt = new Map<string, number>();

    constructor(private readonly cfg: PointGridsDeps) {}

    /** 전체 대사 — 동시 호출은 한 비행을 나눠 탄다. */
    reconcile(): Promise<GridReconcileReport> {
        if (this.inFlight) return this.inFlight;
        const p = this.doReconcile().finally(() => {
            if (this.inFlight === p) this.inFlight = null;
        });
        this.inFlight = p;
        return p;
    }

    private async doReconcile(): Promise<GridReconcileReport> {
        const t0 = (this.cfg.now ?? Date.now)();
        const today = (this.cfg.today ?? kstToday)();
        const anchors = await this.cfg.deps.chartAnchor.listAll();
        // 당일 캔들 기준선 배제 — 축(supplyGap)과 같은 규칙. 지문도 이 필터 뒤의 목록으로 만든다(대칭).
        const usable = dropSameDayAnchors(anchors, BASELINE_PARAM);
        const baselineByChart = new Map<string, ChartAnchor[]>();
        for (const a of usable) {
            if (a.param !== BASELINE_PARAM || a.time != null) continue;
            const k = chartKeyOf(a);
            const list = baselineByChart.get(k);
            if (list) list.push(a);
            else baselineByChart.set(k, [a]);
        }
        const chartRefs: ChartRef[] = [];
        for (const list of baselineByChart.values()) {
            const { stockCode, date } = list[0];
            if (date < today) chartRefs.push({ stockCode, date }); // 오늘·미래 날짜는 pending(굽지 않음)
        }
        const resolved = await resolveBaselines(chartRefs, usable, this.cfg.deps);

        // 기대집합: 날짜 → (코드 → 확정 기준선). null(확정 불가)은 결손으로 센다.
        const expected = new Map<string, Map<string, BaselineAnchor>>();
        let unresolved = 0;
        for (const ref of chartRefs) {
            const winner = resolved.get(chartKeyOf(ref));
            if (winner == null) {
                if (winner === null) unresolved++;
                continue;
            }
            let byCode = expected.get(ref.date);
            if (!byCode) expected.set(ref.date, (byCode = new Map()));
            byCode.set(ref.stockCode, winner);
        }

        const nowMs = (this.cfg.now ?? Date.now)();
        const report: GridReconcileReport = {
            charts: [...expected.values()].reduce((n, m) => n + m.size, 0),
            baked: 0,
            kept: 0,
            materialMissing: [],
            unresolved,
            removedCharts: 0,
            removedDates: 0,
            tookMs: 0,
        };

        // 날짜별 파일 대조 — kept 는 파일에서 그대로, 나머지는 굽기 잡에 쌓는다.
        interface Bake {
            date: string;
            code: string;
            anchor: BaselineAnchor;
            f: string;
        }
        const perDate = new Map<string, { prior: Record<string, PointGridEntry>; next: Record<string, PointGridEntry>; dirty: boolean }>();
        const bakes: Bake[] = [];
        for (const [date, byCode] of expected) {
            const file = await this.cfg.store.read(date);
            const prior = file && file.version === POINT_GRID_CALC_VERSION ? file.charts : {};
            const state = { prior, next: {} as Record<string, PointGridEntry>, dirty: false };
            perDate.set(date, state);
            for (const [code, anchor] of byCode) {
                const f = anchorsFingerprint(baselineByChart.get(`${code}|${date}`) ?? [], [BASELINE_PARAM]);
                const prev = prior[code];
                if (prev && prev.f === f) {
                    state.next[code] = prev;
                    report.kept++;
                    continue;
                }
                const missedAt = this.missingAt.get(`${code}|${date}`);
                if (missedAt !== undefined && nowMs - missedAt < MATERIAL_MISSING_TTL_MS) {
                    report.materialMissing.push({ stockCode: code, date });
                    continue; // 방금 재료 없음이었던 차트 — TTL 안에서는 재조회하지 않는다
                }
                bakes.push({ date, code, anchor, f });
            }
        }

        await mapWithConcurrency(bakes, BAKE_CONCURRENCY, async (b) => {
            const entry = await this.bake(b.code, b.date, b.anchor, b.f);
            const state = perDate.get(b.date)!;
            if (entry === null) {
                this.missingAt.set(`${b.code}|${b.date}`, nowMs);
                report.materialMissing.push({ stockCode: b.code, date: b.date });
                // 옛 항목이 있었다면(지문 불일치인데 새 재료가 없음) 낡은 격자를 남기지 않는다 — 결손은 결손.
                if (state.prior[b.code]) state.dirty = true;
                return;
            }
            this.missingAt.delete(`${b.code}|${b.date}`);
            state.next[b.code] = entry;
            state.dirty = true;
            report.baked++;
        });

        // 파일 반영 — 바뀐 날짜만 쓴다. 기대집합에서 빠진 차트(기준선 삭제)는 next 에 없어 자연히 걷힌다.
        for (const [date, state] of perDate) {
            const removed = Object.keys(state.prior).filter((c) => !(c in state.next)).length;
            report.removedCharts += removed;
            if (!state.dirty && removed === 0) continue;
            if (Object.keys(state.next).length === 0) {
                await this.cfg.store.remove(date);
                continue;
            }
            await this.cfg.store.write({ v: POINT_GRID_FILE_VERSION, version: POINT_GRID_CALC_VERSION, date, charts: state.next });
        }

        // GC — 기대집합에 없는 날짜 파일. 기대집합이 비면 통째 skip(미러 초기화 순간 전량 삭제 사고 방지).
        if (expected.size > 0) {
            try {
                for (const d of await this.cfg.store.listDates()) {
                    if (expected.has(d)) continue;
                    await this.cfg.store.remove(d);
                    report.removedDates++;
                }
            } catch (err) {
                console.warn("[point-grid] GC 실패 — 무해(다음 대사에서 재시도)", err);
            }
        }

        report.tookMs = (this.cfg.now ?? Date.now)() - t0;
        return report;
    }

    /**
     * 차트 하나 굽기. null = 재료 없음(분봉 0건·기준선 캔들 못 읽음) — 무사건 격자(터치 없음 등)와 다르다.
     *
     * 척도: 기준선은 **수정주가 자**(리졸버 계약), 분봉은 **원주가 자**다. 승자 값을 수정주가로 얻은 뒤
     * 차트 날짜의 환산비(rawScaleOf)를 **곱해** 그 날 원주가로 되돌려 검출기에 넣는다 — 안 맞추면
     * 감자·액분 종목에서 첫 터치가 통째로 사라지거나 첫 봉에 붙는다(supplyGap v6 이 반대 방향으로 밟은 함정).
     */
    private async bake(code: string, date: string, anchor: BaselineAnchor, f: string): Promise<PointGridEntry | null> {
        const { minute, rawDaily, adjDaily } = this.cfg.deps;
        const dayRange = { from: date, to: date };
        const [minutes, rawDay, adjDay] = await Promise.all([
            minute.getMinuteCandles(code, date),
            rawDaily.getRawDailyCandles(code, dayRange),
            adjDaily.getDailyCandles(code, dayRange),
        ]);
        if (minutes.length === 0) return null;

        // 승자 앵커 값 — 수정주가 스케일로. 일봉 앵커는 그 하루 수정주가, 분봉 앵커(원주가)는 그 날 환산비로 나눈다.
        let adjusted: number | null;
        if (!anchor.anchorTime) {
            const rows = await adjDaily.getDailyCandles(code, { from: anchor.anchorDate, to: anchor.anchorDate });
            adjusted = candlePrice(rows.find((c) => c.date === anchor.anchorDate)?.[anchor.market]?.[anchor.field]);
        } else {
            const anchorRange = { from: anchor.anchorDate, to: anchor.anchorDate };
            const [anchorMinutes, anchorRaw, anchorAdj] = await Promise.all([
                minute.getMinuteCandles(code, anchor.anchorDate),
                rawDaily.getRawDailyCandles(code, anchorRange),
                adjDaily.getDailyCandles(code, anchorRange),
            ]);
            const bar = anchorMinutes.find((c) => c.time === anchor.anchorTime);
            const price = candlePrice((anchor.market === "krx" ? bar?.krx : bar?.un)?.[anchor.field]);
            const scale = rawScaleOf(anchorRaw, anchorAdj, anchor.anchorDate);
            adjusted = price !== null && scale > 0 ? price / scale : null;
        }
        if (adjusted === null) return null;

        const base = Math.round(adjusted * rawScaleOf(rawDay, adjDay, date) * 1e6) / 1e6;
        const grid = detectGrid(minutes, base, this.cfg.detect);
        return grid === null ? null : { f, grid };
    }
}
