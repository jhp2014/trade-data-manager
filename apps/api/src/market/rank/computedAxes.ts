// ComputedAxes — 계산 축의 `타점 → 수치`를 굽고 캐시하는 읽기모델(app 읽기측).
//
// 캐시 단위를 **재료가 아니라 결과**로 잡는다. 재료(분봉·일봉·가격선·앵커)는 축마다 모양이 달라 공유 캐시를
// 만들면 축을 추가할 때마다 그 계층을 손대야 한다. 결과는 축이 몇 개든 `타점 → 수치` 한 모양이라 캐시 코드가
// 안 늘어난다. 그래서 축끼리 재료를 공유하지 않는다(같은 일봉을 두 축이 각자 읽어도 그게 싸다).
//
// 증분이 가능한 이유는 축이 **타점별 독립**이기 때문(core axis.ts 규칙 1): 타점이 하나 늘면 그것만 계산해
// 덧붙인다. 축이 모집단(백분위 등)에 의존했다면 타점 하나에 전량 재계산이었을 것이다.
//
// **앵커 지문(무효화의 심장)**: params 를 선언한 축은 값이 사람 입력(타점 파라미터 앵커)에 의존한다.
// 캐시 항목마다 그 타점의 앵커 지문(f)을 함께 저장하고, 매 요청 현재 앵커와 대조해 **다른 것만** 다시 굽는다 —
// 앵커를 지정/이동/해제하면 그 타점만 자동 재계산되고, 사용자는 캐시를 의식할 일이 없다.
// 지문 자체는 순수 함수(axisFingerprint.ts), 파일 계층은 axisValueStore.ts — 여기는 증분 조율만.
// (시장 데이터 변경(백필·수정주가 재작성)은 지문 밖 — 드물어서 운영 처방 = def.version 상향/캐시 삭제.)
//
// 결손(값 없음)은 캐시하지 않는다 — 분봉 미수집 타점이 나중에 채워질 수 있어 "없음"을 굳히면 영구 오염이다
// (DerivedCache 가 오늘 날짜를 안 굳히는 것과 같은 이유). 대신 결손 비율이 높으면 트립와이어로 알린다.
import type { ComputedAxisDef, AxisDeps, ChartAnchor, ReviewPointKey, ReviewPointReader } from "@trade-data-manager/market";
import { COMPUTED_AXES, anchorAppliesTo, chartKeyOf, pointKeyOf } from "@trade-data-manager/market";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { fingerprintParams, fingerprintOf } from "./axisFingerprint.js";
import { FILE_SCHEMA_VERSION, fileAxisValueStore, type AxisValueEntry, type AxisValueStore } from "./axisValueStore.js";

export type { ComputedAxisFeed };

/** 결손 경고 임계 — 이 비율을 넘으면 재료 파이프라인 의심(분봉 미수집·시각 이상). */
const MISSING_WARN_RATIO = 0.2;

export interface ComputedAxesDeps {
    /** 모집단 = 전 복기 타점. 축은 타점별 독립이라 여기서 순서·집합에 의미를 두지 않는다. */
    points: ReviewPointReader;
    axisDeps: AxisDeps;
    /** 기본 = 코드 레지스트리 전체. 테스트가 좁힌 목록을 준다. */
    defs?: readonly ComputedAxisDef[];
    store?: AxisValueStore;
}

export class ComputedAxes {
    private readonly defs: readonly ComputedAxisDef[];
    private readonly store: AxisValueStore;
    /** 축별 in-flight 공유 — 패널 여럿이 동시에 열려도 굽기는 한 번. */
    private readonly inFlight = new Map<string, { gen: number; promise: Promise<ComputedAxisFeed> }>();
    // 변경(앵커·타점) 세대 — 변경 전에 시작된 빌드는 옛 재료(앵커 지문 포함)를 읽었으므로, 변경 **후**
    // 온 refetch 가 거기 합류하면 방금 편집이 응답에 없다. 세대가 다르면 합류하지 않고 새로 굽는다.
    private generation = 0;

    constructor(private readonly deps: ComputedAxesDeps) {
        this.defs = deps.defs ?? COMPUTED_AXES;
        this.store = deps.store ?? fileAxisValueStore;
    }

    /** 앵커·타점 변경 직후 호출(컨트롤러) — 진행 중 빌드를 취소하진 않고, 새 요청의 합류만 막는다. */
    invalidate(): void {
        this.generation++;
    }

    /** 전 계산 축의 피드. 판단 축 줄 피드(/placements)와 같은 이유로 축 단건 조회는 두지 않는다. */
    async feeds(): Promise<ComputedAxisFeed[]> {
        if (this.defs.length === 0) return [];
        const points = await this.deps.points.listAllPoints();
        // 앵커는 지문용으로 한 번만 읽는다(축이 compute 안에서 또 읽는 건 축 자신의 몫 — 축끼리 재료 비공유 원칙).
        // 파라미터 선언 축이 하나도 없으면 조회 자체를 건너뛴다.
        const anchors = this.defs.some((d) => fingerprintParams(d).length > 0) ? await this.deps.axisDeps.chartAnchor.listAll() : [];
        return Promise.all(this.defs.map((def) => this.feed(def, points, anchors)));
    }

    private feed(def: ComputedAxisDef, points: ReviewPointKey[], anchors: ChartAnchor[]): Promise<ComputedAxisFeed> {
        const existing = this.inFlight.get(def.key);
        if (existing && existing.gen === this.generation) return existing.promise;
        const gen = this.generation;
        const promise = this.build(def, points, anchors).finally(() => {
            if (this.inFlight.get(def.key)?.promise === promise) this.inFlight.delete(def.key);
        });
        this.inFlight.set(def.key, { gen, promise });
        return promise;
    }

    private async build(def: ComputedAxisDef, points: ReviewPointKey[], anchors: ChartAnchor[]): Promise<ComputedAxisFeed> {
        const cached = await this.store.read(def.key);
        // 계산식이 바뀌었으면(version 상향) 옛 값은 다른 식의 산물이라 통째로 버린다.
        const known = cached && cached.version === def.version ? cached.values : {};

        // 차트(종목,날짜) 단위로 모아두고 타점마다 anchorAppliesTo 로 좁힌다(차트 소유 = 전 타점, 타점 소유 = 그 시각).
        const anchorsByChart = new Map<string, ChartAnchor[]>();
        for (const a of anchors) {
            const k = chartKeyOf(a);
            const list = anchorsByChart.get(k);
            if (list) list.push(a);
            else anchorsByChart.set(k, [a]);
        }
        // pointCoupled 지문용 형제 시각 — points 는 전 타점(listAllPoints)이라 차트별로 완전한 목록이다.
        const timesByChart = new Map<string, string[]>();
        if (def.pointCoupled) {
            for (const p of points) {
                const k = chartKeyOf(p);
                const list = timesByChart.get(k);
                if (list) list.push(p.time);
                else timesByChart.set(k, [p.time]);
            }
        }
        const applicableTo = (p: ReviewPointKey): ChartAnchor[] =>
            (anchorsByChart.get(chartKeyOf(p)) ?? []).filter((a) => anchorAppliesTo(a, p));
        const fpCache = new Map<string, string>();
        const fpOf = (p: ReviewPointKey): string => {
            const k = pointKeyOf(p);
            let fp = fpCache.get(k);
            if (fp === undefined) {
                fp = fingerprintOf(def, applicableTo(p), timesByChart.get(chartKeyOf(p)) ?? []);
                fpCache.set(k, fp);
            }
            return fp;
        };

        // 다시 구울 타점 = 캐시에 없음 ∪ 지문 불일치(앵커 지정/이동/해제). 나머지는 캐시 히트.
        const live = new Set(points.map(pointKeyOf));
        const pointByKey = new Map(points.map((p) => [pointKeyOf(p), p]));
        const stale = points.filter((p) => {
            const entry = known[pointKeyOf(p)];
            return entry === undefined || entry.f !== fpOf(p);
        });
        const computed = stale.length > 0 ? await def.compute(stale, this.deps.axisDeps) : [];
        const computedByKey = new Map(computed.map((c) => [pointKeyOf(c), c]));

        // 조립 — 살아있는 타점만(삭제 청소) + 다시 구운 타점은 새 값·새 지문으로 교체.
        // 다시 구웠는데 값이 안 나온 타점(앵커 해제·재료 소실)은 **지운다** — 옛 값이 남는 게 최악의 실패.
        const values: Record<string, AxisValueEntry> = {};
        let changed = !cached || cached.version !== def.version;
        for (const [k, entry] of Object.entries(known)) {
            const p = pointByKey.get(k);
            if (!live.has(k) || p === undefined) { changed = true; continue; } // 타점 삭제
            if (entry.f !== fpOf(p)) { changed = true; continue; } // stale — 아래 computed 가 있으면 새로 채움
            values[k] = entry;
        }
        for (const p of stale) {
            const k = pointKeyOf(p);
            const c = computedByKey.get(k);
            if (c !== undefined) { values[k] = { v: c.value, f: fpOf(p), ...(c.saturated ? { s: true } : {}) }; changed = true; }
        }
        // 파일 저장은 best-effort — 값은 이미 메모리에 완성돼 있다. 디스크 실패(권한·용량)로 응답까지
        // 죽이면 손해만 남는다(다음 빌드가 cold 로 다시 굽는 게 전부다).
        if (changed) {
            try {
                await this.store.write({ v: FILE_SCHEMA_VERSION, key: def.key, version: def.version, values });
            } catch (err) {
                console.warn(`[rank-axis] ${def.key}: 캐시 쓰기 실패 — 메모리 결과는 그대로 서빙`, err);
            }
        }
        // 결손 분모: **필수 파라미터가 다 찍힌 타점**만 — 아직 안 찍은 타점은 결손이 아니라 "입력 전"이다
        // (그걸 분모에 넣으면 정상 상태가 상시 경고가 된다). 지문 유무로 대신 세면 안 된다: 선택 파라미터만
        // 찍힌 타점(무시 캔들만 지정)도 지문이 생겨 입력 완료로 집계된다.
        const required = def.params ?? [];
        const hasRequired = (p: ReviewPointKey): boolean => {
            const owned = applicableTo(p);
            return required.every((r) => owned.some((a) => a.param === r));
        };
        const eligible = required.length > 0 ? points.filter(hasRequired).length : points.length;
        this.reportMissing(def, eligible, Object.keys(values).length);

        return {
            key: def.key,
            name: def.name,
            strongerWhen: def.strongerWhen,
            grain: def.grain ?? "point",
            display: def.display,
            // 타점 순서 그대로 — 정렬은 클라가 질의 시점 모집단 위에서 한다.
            values: points
                .filter((p) => values[pointKeyOf(p)] !== undefined)
                .map((p) => {
                    const e = values[pointKeyOf(p)];
                    return { stockCode: p.stockCode, date: p.date, time: p.time, value: e.v, ...(e.s ? { saturated: true } : {}) };
                }),
        };
    }

    // 결손 트립와이어 — 정상 타점은 분봉이 있어야 한다. 결손이 몰리면 축 버그가 아니라 재료 사고(분봉 미수집·
    // 시장 세션 부재)일 가능성이 크고, 조용히 미배치로 보이면 "아직 안 꽂은 축"과 구분이 안 된다.
    private reportMissing(def: ComputedAxisDef, total: number, present: number): void {
        if (total === 0) return;
        const missing = total - present;
        if (missing / total <= MISSING_WARN_RATIO) return;
        console.warn(`[rank-axis] ${def.key}: 타점 ${total}건 중 ${missing}건 결손 — 분봉 미수집/시장 세션 부재 의심`);
    }
}
