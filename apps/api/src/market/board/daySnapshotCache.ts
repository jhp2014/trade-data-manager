// 당일 스냅샷 파일 캐시 — 날짜별 불변 파생(분봉파생 + EOD 일봉 %·시총)을 gzip 파일로. 저수준 read/write 만.
// (build 조율·in-flight dedup·영구캐시 게이트는 DerivedCache. 조립·메타 stitch 는 DayBoards.)
//
// 전부 **불변 입력**에서 나온다: 분봉파생(분봉+원주가일봉, append-only) · EOD %(조정 불변) · 시총(별 테이블 확정).
// 그래서 과거 거래일은 영구 캐시 안전(자가치유가 닿지 않는다). 오늘은 수집이 진행 중일 수 있어(20:30 스윕) 부분
// 상태가 굳으면 영구 오염 → DerivedCache 가 date < KST today 인 날만 파일로 굳힌다(오늘은 매 요청 재빌드).
//
// ⚠ 캐시 무효화: 아래를 바꾸면 낡는다 → DAY_SNAPSHOT_CACHE_DIR(기본 .cache/day-snapshot/)를 통째 삭제.
//    · DaySnapshot / MinuteDerived / DayStats 스키마 · deriveMinutes · dailyStatsOf · densify · 분봉 거래대금 공식
import { promises as fs } from "node:fs";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import type { MinuteDerived, DayStats } from "@trade-data-manager/market";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const CACHE_ROOT = process.env.DAY_SNAPSHOT_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/day-snapshot");

/** 한 종목의 그날 불변 파생. universe = 분봉 있는 종목이라 minutes 는 항상 present. */
export interface DaySnapshot {
    code: string;
    /** 그 거래일 시총(원, 무손실 string). 미백필이면 null. */
    marketCap: string | null;
    /** EOD 일봉 파생(직전 UN 종가 대비 %, 조정 불변). 일봉 미수집이면 null. */
    stats: DayStats | null;
    /** 분봉 파생 시계열(복기 full + 테마 stats 재계산 원자재). */
    minutes: MinuteDerived;
}

/** 날짜별 스냅샷 파일(캐시 단위). */
export interface DaySnapshotFile {
    date: string;
    stocks: DaySnapshot[];
}

function filePath(date: string): string {
    return path.join(CACHE_ROOT, `${date}.json.gz`);
}

/** 파일에서 스냅샷을 읽는다. 없으면 null(ENOENT). */
export async function readSnapshot(date: string): Promise<DaySnapshotFile | null> {
    try {
        const buf = await fs.readFile(filePath(date));
        return JSON.parse((await gunzipAsync(buf)).toString("utf8")) as DaySnapshotFile;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
    }
}

/**
 * 스냅샷 저장소(read/write) — DerivedCache 에 주입해 파일 I/O 를 분리(테스트는 in-memory fake).
 * 기본 구현 = gzip 파일(fileSnapshotStore).
 */
export interface DaySnapshotStore {
    read(date: string): Promise<DaySnapshotFile | null>;
    write(file: DaySnapshotFile): Promise<void>;
}

/** 기본 파일 저장소 — 모듈 함수 read/writeSnapshot 를 그대로 노출. */
export const fileSnapshotStore: DaySnapshotStore = {
    read: readSnapshot,
    write: writeSnapshot,
};

/** 스냅샷을 gzip 파일로 저장한다. */
export async function writeSnapshot(data: DaySnapshotFile): Promise<void> {
    const fp = filePath(data.date);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const gz = await gzipAsync(Buffer.from(JSON.stringify(data), "utf8"));
    // temp 파일에 쓰고 rename(원자적) — 쓰기 도중 크래시/kill 이 truncate 된 파일을 최종 경로에 남기면
    // 이후 read 가 ENOENT 가 아닌 gunzip/JSON 에러를 던져 그 날짜가 영구히 못 읽히게 되는 걸 막는다.
    const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
    try {
        await fs.writeFile(tmp, gz);
        await fs.rename(tmp, fp);
    } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
    }
}
