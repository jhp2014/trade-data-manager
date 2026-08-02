// ComputedAxes — 계산 축의 `타점 → 수치`를 굽고 캐시하는 읽기모델(app 읽기측).
//
// 캐시 단위를 **재료가 아니라 결과**로 잡는다. 재료(분봉·일봉·가격선·앵커)는 축마다 모양이 달라 공유 캐시를
// 만들면 축을 추가할 때마다 그 계층을 손대야 한다. 결과는 축이 몇 개든 `타점 → 수치` 한 모양이라 캐시 코드가
// 안 늘어난다. 그래서 축끼리 재료를 공유하지 않는다(같은 일봉을 두 축이 각자 읽어도 그게 싸다).
//
// 증분이 가능한 이유는 축이 **타점별 독립**이기 때문(core axis.ts 규칙 1): 타점이 하나 늘면 그것만 계산해
// 덧붙인다. 축이 모집단(백분위 등)에 의존했다면 타점 하나에 전량 재계산이었을 것이다.
//
// 결손(값 없음)은 캐시하지 않는다 — 분봉 미수집 타점이 나중에 채워질 수 있어 "없음"을 굳히면 영구 오염이다
// (DerivedCache 가 오늘 날짜를 안 굳히는 것과 같은 이유). 대신 결손 비율이 높으면 트립와이어로 알린다.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ComputedAxisDef, AxisDeps, ReviewPointKey, ReviewPointReader } from "@trade-data-manager/market";
import { COMPUTED_AXES } from "@trade-data-manager/market";
import type { ComputedAxisFeed } from "@trade-data-manager/wire";

export type { ComputedAxisFeed };

const CACHE_ROOT = process.env.RANK_AXIS_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/rank-axis");

/** 파일 스키마 버전. 파일 모양(축 정의가 아니라)이 바뀌면 올린다 — 축 계산식 변경은 def.version 쪽. */
const FILE_SCHEMA_VERSION = 1;

/** 결손 경고 임계 — 이 비율을 넘으면 재료 파이프라인 의심(분봉 미수집·시각 이상). */
const MISSING_WARN_RATIO = 0.2;

const pointKey = (p: ReviewPointKey): string => `${p.stockCode}|${p.date}|${p.time}`;

/** 축 하나의 값 파일. values 는 pointKey → 수치(결손은 키 자체가 없다). */
export interface AxisValueFile {
    v: number;
    key: string;
    /** 구운 시점의 축 계산식 버전. def.version 과 다르면 통째 무효. */
    version: number;
    values: Record<string, number>;
}

/** 값 저장소 — 파일 I/O 를 분리해 테스트가 in-memory fake 를 주입한다. */
export interface AxisValueStore {
    read(key: string): Promise<AxisValueFile | null>;
    write(file: AxisValueFile): Promise<void>;
}

const filePath = (key: string): string => path.join(CACHE_ROOT, `${key}.json`);

export const fileAxisValueStore: AxisValueStore = {
    async read(key) {
        try {
            const parsed = JSON.parse(await fs.readFile(filePath(key), "utf8")) as AxisValueFile;
            return parsed.v === FILE_SCHEMA_VERSION ? parsed : null; // 구스키마 = miss(재빌드가 자가치유)
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
            console.warn(`[rank-axis] 캐시 읽기 실패, 재빌드: ${filePath(key)}`, err);
            return null;
        }
    },
    async write(file) {
        await fs.mkdir(CACHE_ROOT, { recursive: true });
        const fp = filePath(file.key);
        const tmp = `${fp}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(file), "utf8");
        await fs.rename(tmp, fp); // 원자적 교체 — 부분 파일이 남지 않게
    },
};

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
    private readonly inFlight = new Map<string, Promise<ComputedAxisFeed>>();

    constructor(private readonly deps: ComputedAxesDeps) {
        this.defs = deps.defs ?? COMPUTED_AXES;
        this.store = deps.store ?? fileAxisValueStore;
    }

    /** 전 계산 축의 피드. 판단 축 줄 피드(/placements)와 같은 이유로 축 단건 조회는 두지 않는다. */
    async feeds(): Promise<ComputedAxisFeed[]> {
        if (this.defs.length === 0) return [];
        const points = await this.deps.points.listAllPoints();
        return Promise.all(this.defs.map((def) => this.feed(def, points)));
    }

    private feed(def: ComputedAxisDef, points: ReviewPointKey[]): Promise<ComputedAxisFeed> {
        const existing = this.inFlight.get(def.key);
        if (existing) return existing;
        const p = this.build(def, points).finally(() => this.inFlight.delete(def.key));
        this.inFlight.set(def.key, p);
        return p;
    }

    private async build(def: ComputedAxisDef, points: ReviewPointKey[]): Promise<ComputedAxisFeed> {
        const cached = await this.store.read(def.key);
        // 계산식이 바뀌었으면(version 상향) 옛 값은 다른 식의 산물이라 통째로 버린다.
        const known = cached && cached.version === def.version ? cached.values : {};

        const live = new Set(points.map(pointKey));
        const missing = points.filter((p) => known[pointKey(p)] === undefined);
        const computed = missing.length > 0 ? await def.compute(missing, this.deps.axisDeps) : [];

        // 살아있는 타점만 남긴다(삭제된 타점의 값은 캐시에서 청소).
        const values: Record<string, number> = {};
        for (const [k, v] of Object.entries(known)) if (live.has(k)) values[k] = v;
        for (const c of computed) values[pointKey(c)] = c.value;

        const grew = computed.length > 0;
        const shrank = Object.keys(known).some((k) => !live.has(k));
        if (grew || shrank || !cached || cached.version !== def.version) {
            await this.store.write({ v: FILE_SCHEMA_VERSION, key: def.key, version: def.version, values });
        }
        this.reportMissing(def, points.length, Object.keys(values).length);

        return {
            key: def.key,
            name: def.name,
            strongerWhen: def.strongerWhen,
            // 타점 순서 그대로 — 정렬은 클라가 질의 시점 모집단 위에서 한다.
            values: points
                .filter((p) => values[pointKey(p)] !== undefined)
                .map((p) => ({ stockCode: p.stockCode, date: p.date, time: p.time, value: values[pointKey(p)] })),
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
