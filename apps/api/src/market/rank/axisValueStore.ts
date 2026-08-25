// 계산 축 값 파일 저장소 — 축당 `타점 → 수치` 파일의 저수준 read/write 만.
// (증분·지문 대조·조립은 ComputedAxes. daySnapshotCache/DerivedCache 분리와 같은 결 —
//  파일 I/O 를 떼어 테스트가 in-memory fake 를 주입한다.)
import { promises as fs } from "node:fs";
import path from "node:path";

const CACHE_ROOT = process.env.RANK_AXIS_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/rank-axis");

/** 파일 스키마 버전. 파일 모양(축 정의가 아니라)이 바뀌면 올린다 — 축 계산식 변경은 def.version 쪽.
 *  v3: day 축 행 키가 pointKey → chartKey(행 = 차트). 구파일 = miss(전량 재빌드).
 *  v2: 값에 입력 지문(f) 동봉 — 앵커 의존 축의 자동 무효화. */
export const FILE_SCHEMA_VERSION = 3;

/** 캐시 항목 — 수치 + 구운 시점의 입력 지문(앵커 무관 축은 "") + 우측 절단 여부(s, 아니면 생략). */
export interface AxisValueEntry {
    v: number;
    f: string;
    s?: boolean;
}

/** 축 하나의 값 파일. values 는 행 키(point 축=pointKey·day 축=chartKey) → 항목(결손은 키 자체가 없다). */
export interface AxisValueFile {
    v: number;
    key: string;
    /** 구운 시점의 축 계산식 버전. def.version 과 다르면 통째 무효. */
    version: number;
    values: Record<string, AxisValueEntry>;
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
