// ComputedAxes — 계산 축의 `행 → 수치`를 굽고 캐시하는 읽기모델(app 읽기측).
//
// **행의 정체성은 축의 grain 이 정한다**: point 축 = 타점(종목,날짜,시각), day 축 = 차트(종목,날짜).
// day 축의 모수는 타점이 아니라 **필수 param 앵커가 있는 차트 전부**다 — 분봉 타점을 아직 안 찍었어도
// curation 입력(기준선)이 있으면 값이 나온다. 옛 fanout 모델(타점 행)에서는 "계산 안 됨"(타점 없음)이
// "미배치"로 위장했다 — 그 교정이 이 재편의 발단이다.
// **params 를 선언하지 않은 day 축**(전일 고가 % 류 — 재료가 시장 데이터로 완결)은 그 정의로 모수를 못 뽑는다.
// 그때는 **후보 하루 전부**(앵커 ∪ 그룹 멤버십)가 모수다 = 클라 `candidateDaysOf` 와 같은 정의.
// 타점 차트로만 폴백하던 옛 규칙은 실측 54행(≪ 하루 층위 작업 모수 ~5,900)이라 축이 조용히 비었다.
//
// 캐시 단위를 **재료가 아니라 결과**로 잡는다. 재료(분봉·일봉·가격선·앵커)는 축마다 모양이 달라 공유 캐시를
// 만들면 축을 추가할 때마다 그 계층을 손대야 한다. 결과는 축이 몇 개든 `행 → 수치` 한 모양이라 캐시 코드가
// 안 늘어난다. 그래서 축끼리 재료를 공유하지 않는다(같은 일봉을 두 축이 각자 읽어도 그게 싸다).
//
// 증분이 가능한 이유는 축이 **행별 독립**이기 때문(core axis.ts 규칙 1): 행이 하나 늘면 그것만 계산해
// 덧붙인다. 축이 모집단(백분위 등)에 의존했다면 행 하나에 전량 재계산이었을 것이다.
//
// **앵커 지문(무효화의 심장)**: params 를 선언한 축은 값이 사람 입력(파라미터 앵커)에 의존한다.
// 캐시 항목마다 그 행의 앵커 지문(f)을 함께 저장하고, 매 요청 현재 앵커와 대조해 **다른 것만** 다시 굽는다 —
// 앵커를 지정/이동/해제하면 그 행만 자동 재계산되고, 사용자는 캐시를 의식할 일이 없다.
// 지문 자체는 순수 함수(axisFingerprint.ts), 파일 계층은 axisValueStore.ts — 여기는 증분 조율만.
// (시장 데이터 변경(백필·수정주가 재작성)은 지문 밖 — 드물어서 운영 처방 = def.version 상향/캐시 삭제.)
//
// 결손(값 없음)은 캐시하지 않는다 — 분봉 미수집 타점이 나중에 채워질 수 있어 "없음"을 굳히면 영구 오염이다
// (DerivedCache 가 오늘 날짜를 안 굳히는 것과 같은 이유). 대신 결손 비율이 높으면 트립와이어로 알린다.
import type { ComputedAxisDef, AxisDeps, ChartAnchor, ChartRef, GroupMembership, GroupReader } from "@trade-data-manager/market";
import { COMPUTED_AXES, chartKeyOf } from "@trade-data-manager/market";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";
import { fingerprintOf } from "./axisFingerprint.js";
import { FILE_SCHEMA_VERSION, fileAxisValueStore, type AxisValueEntry, type AxisValueStore } from "./axisValueStore.js";

export type { ComputedAxisFeed };

/** 결손 경고 임계 — 이 비율을 넘으면 재료 파이프라인 의심(분봉 미수집·시각 이상). */
const MISSING_WARN_RATIO = 0.2;

/** 앵커 무관 day 축인가 — 모수가 "필수 앵커 있는 차트"가 아니라 **후보 하루 전부**인 축(dayCharts 참조). */
const isOpenDayAxis = (def: ComputedAxisDef): boolean => def.grain === "day" && (def.params ?? []).length === 0;

export interface ComputedAxesDeps {
    /**
     * 그룹 멤버십 — **앵커 무관 day 축의 모수 재료**(그 축의 계산 재료가 아니다).
     * 그룹만 붙여 둔 하루도 후보 하루라(클라 candidateDaysOf) 여기 빠지면 그 행만 값이 비는데,
     * 화면에서는 "미계산"인지 "모수 밖"인지 구분되지 않는다. 읽기는 사람 편집 규모라 무시할 만하다.
     */
    groups: Pick<GroupReader, "listAllMemberships">;
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

    /** 전 계산 축의 피드. 축 단건 조회는 두지 않는다 — 소비자가 모두 전 축을 본다. */
    async feeds(): Promise<ComputedAxisFeed[]> {
        if (this.defs.length === 0) return [];
        // 앵커 무관 day 축이 하나라도 있으면 그 모수(후보 하루)가 그룹 멤버십까지 재료로 쓴다.
        const needUniverse = this.defs.some(isOpenDayAxis);
        // 앵커는 지문 + 모수용으로 한 번만 읽는다(축이 compute 안에서 또 읽는 건 축 자신의 몫 —
        // 축끼리 재료 비공유 원칙). 축이 전부 day 그레인이라 앵커는 **언제나** 필요하다(모수가 앵커다).
        const [anchors, memberships] = await Promise.all([
            this.deps.axisDeps.chartAnchor.listAll(),
            needUniverse ? this.deps.groups.listAllMemberships() : Promise.resolve([]),
        ]);
        return Promise.all(this.defs.map((def) => this.feed(def, anchors, memberships)));
    }

    private feed(def: ComputedAxisDef, anchors: ChartAnchor[], memberships: GroupMembership[]): Promise<ComputedAxisFeed> {
        const existing = this.inFlight.get(def.key);
        if (existing && existing.gen === this.generation) return existing.promise;
        const gen = this.generation;
        const promise = this.build(def, anchors, memberships).finally(() => {
            if (this.inFlight.get(def.key)?.promise === promise) this.inFlight.delete(def.key);
        });
        this.inFlight.set(def.key, { gen, promise });
        return promise;
    }

    /**
     * day 축의 모수 — **필수 param 앵커(차트 소유)가 전부 있는 차트**. 앵커가 곧 입력이라, 모수를 타점이
     * 아니라 앵커에서 뽑아야 "타점 0 + 기준선 있음"인 하루가 행이 된다(이 재편의 수용 기준).
     *
     * 필수 param 이 없는 day 축은 **후보 하루 전부**(앵커 ∪ 그룹) — 재료가 시장 데이터로 완결돼
     * 어느 하루든 값이 나오므로, 모수를 좁힐 근거가 없고 좁히면 시트 day 행에 설명 없는 빈칸이 생긴다.
     * 클라 `candidateDaysOf`(lib/presence.ts)와 **같은 정의여야 한다** — 한쪽만 고치면 두 화면이 갈린다.
     * (코멘트만 있는 날은 양쪽 다 제외: 코멘트는 기록이지 판단이 아니다.)
     */
    private dayCharts(def: ComputedAxisDef, anchors: ChartAnchor[], memberships: GroupMembership[]): ChartRef[] {
        const required = def.params ?? [];
        if (required.length === 0) {
            const seen = new Map<string, ChartRef>();
            // 앵커는 타점 소유(a.time != null)도 센다 — 여기서 앵커는 이 축의 **재료가 아니라 흔적**이라
            // "그 하루에 사람이 손댔나"만 묻는다(차트 소유만 세는 아래 규칙과 목적이 다르다).
            // 타점은 항이 아니다 — 격자 파생물이라 사람 편집물이 아니고, 클라 candidateDaysOf 도 같다.
            for (const r of [...anchors, ...memberships]) {
                const k = chartKeyOf(r);
                if (!seen.has(k)) seen.set(k, { stockCode: r.stockCode, date: r.date });
            }
            return [...seen.values()];
        }
        const paramsByChart = new Map<string, Set<string>>();
        const refByChart = new Map<string, ChartRef>();
        for (const a of anchors) {
            if (a.time != null) continue; // 타점 소유 앵커는 day 축의 재료가 아니다(값이 시각에 물든다)
            const k = chartKeyOf(a);
            let set = paramsByChart.get(k);
            if (!set) { set = new Set(); paramsByChart.set(k, set); refByChart.set(k, { stockCode: a.stockCode, date: a.date }); }
            set.add(a.param);
        }
        const out: ChartRef[] = [];
        for (const [k, set] of paramsByChart) if (required.every((r) => set.has(r))) out.push(refByChart.get(k)!);
        return out;
    }

    private async build(def: ComputedAxisDef, anchors: ChartAnchor[], memberships: GroupMembership[]): Promise<ComputedAxisFeed> {
        const rowKey = chartKeyOf;
        const items: ChartRef[] = this.dayCharts(def, anchors, memberships);

        const cached = await this.store.read(def.key);
        // 계산식이 바뀌었으면(version 상향) 옛 값은 다른 식의 산물이라 통째로 버린다.
        const known = cached && cached.version === def.version ? cached.values : {};

        // 차트(종목,날짜) 단위로 모아두고 행마다 적용 앵커로 좁힌다 — 그 차트의 **차트 소유** 앵커 전부
        // (타점 소유는 재료가 아니다 — dayCharts 와 같은 규칙).
        const anchorsByChart = new Map<string, ChartAnchor[]>();
        for (const a of anchors) {
            const k = chartKeyOf(a);
            const list = anchorsByChart.get(k);
            if (list) list.push(a);
            else anchorsByChart.set(k, [a]);
        }
        const applicableTo = (r: ChartRef): ChartAnchor[] => (anchorsByChart.get(chartKeyOf(r)) ?? []).filter((a) => a.time == null);
        const fpCache = new Map<string, string>();
        const fpOf = (r: ChartRef): string => {
            const k = rowKey(r);
            let fp = fpCache.get(k);
            if (fp === undefined) {
                fp = fingerprintOf(def, applicableTo(r));
                fpCache.set(k, fp);
            }
            return fp;
        };

        // 다시 구울 행 = 캐시에 없음 ∪ 지문 불일치(앵커 지정/이동/해제). 나머지는 캐시 히트.
        const live = new Set(items.map(rowKey));
        const itemByKey = new Map(items.map((r) => [rowKey(r), r]));
        const stale = items.filter((r) => {
            const entry = known[rowKey(r)];
            return entry === undefined || entry.f !== fpOf(r);
        });
        const computed = stale.length === 0 ? [] : await def.compute(stale, this.deps.axisDeps);
        const computedByKey = new Map(computed.map((c) => [rowKey(c), c]));

        // 조립 — 살아있는 행만(삭제 청소) + 다시 구운 행은 새 값·새 지문으로 교체.
        // 다시 구웠는데 값이 안 나온 행(앵커 해제·재료 소실)은 **지운다** — 옛 값이 남는 게 최악의 실패.
        const values: Record<string, AxisValueEntry> = {};
        let changed = !cached || cached.version !== def.version;
        for (const [k, entry] of Object.entries(known)) {
            const r = itemByKey.get(k);
            if (!live.has(k) || r === undefined) { changed = true; continue; } // 행 소멸(타점 삭제·앵커 해제)
            if (entry.f !== fpOf(r)) { changed = true; continue; } // stale — 아래 computed 가 있으면 새로 채움
            values[k] = entry;
        }
        for (const r of stale) {
            const k = rowKey(r);
            const c = computedByKey.get(k);
            if (c !== undefined) { values[k] = { v: c.value, f: fpOf(r), ...(c.saturated ? { s: true } : {}) }; changed = true; }
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
        // 결손 분모: **필수 파라미터가 다 찍힌 행**만 — 아직 안 찍은 행은 결손이 아니라 "입력 전"이다.
        // day 축은 모수 자체가 그 필터(dayCharts)라 items 전체가 분모다. 지문 유무로 대신 세면 안 된다:
        // 선택 파라미터만 찍힌 행(무시 캔들만 지정)도 지문이 생겨 입력 완료로 집계된다.
        const eligible = items.length;
        this.reportMissing(def, eligible, Object.keys(values).length);

        return {
            key: def.key,
            name: def.name,
            strongerWhen: def.strongerWhen,
            grain: def.grain,
            display: def.display,
            // 행 순서 그대로 — 정렬은 클라가 질의 시점 모집단 위에서 한다. 행 = 차트라 time 이 없다
            // (와이어의 `time?` 은 클라 파생 point 축 피드가 여전히 쓴다 — 계약은 두 grain 을 계속 싣는다).
            values: items
                .filter((r) => values[rowKey(r)] !== undefined)
                .map((r) => {
                    const e = values[rowKey(r)];
                    return { stockCode: r.stockCode, date: r.date, value: e.v, ...(e.s ? { saturated: true } : {}) };
                }),
        };
    }

    // 결손 트립와이어 — 입력이 갖춰진 행은 값이 나와야 한다. 결손이 몰리면 축 버그가 아니라 재료 사고
    // (분봉·일봉 미수집)일 가능성이 크고, 조용히 미배치로 보이면 "입력 전"과 구분이 안 된다.
    private reportMissing(def: ComputedAxisDef, total: number, present: number): void {
        if (total === 0) return;
        const missing = total - present;
        if (missing / total <= MISSING_WARN_RATIO) return;
        console.warn(`[rank-axis] ${def.key}: 행 ${total}건 중 ${missing}건 결손 — 재료 미수집/시장 세션 부재 의심`);
    }
}
