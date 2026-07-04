// 당일 축약물 파일 캐시 — lazy read-through. 첫 요청 시 계산→gzip 파일 저장→반환, 이후엔 파일만 읽음.
// 과거 거래일은 immutable 이라 무효화는 **캐시 버전**으로만: 축약 로직/파라미터를 바꾸면 DAY_REDUCTION_VERSION
// 을 +1 → 저장된 .version 과 달라 캐시 폴더를 통째로 비우고 다시 굽는다(버전 폴더 누적 X, [[day-reduction-cache-design]]).
// DB 아님: 재생성 가능한 파생물이라 진실원천(market 스키마)의 "본질만 저장" 잠금과 무관.
import { promises as fs } from "node:fs";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import { DAY_REDUCTION_VERSION, type DayReduction } from "./dayReduction.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const CACHE_ROOT = process.env.DAY_REDUCTION_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/day-reduction");
const VERSION_PATH = path.join(CACHE_ROOT, ".version");
const VERSION = String(DAY_REDUCTION_VERSION);

function filePath(date: string): string {
    return path.join(CACHE_ROOT, `${date}.json.gz`);
}

// 캐시 버전이 바뀌었으면(DAY_REDUCTION_VERSION +1) 캐시 폴더를 통째로 비우고 새 버전을 스탬프한다.
// 프로세스당 1회만 검사(버전은 프로세스 내 상수, 재배포 시엔 프로세스 재시작으로 자연히 재검사).
let freshOnce: Promise<void> | null = null;
function ensureFresh(): Promise<void> {
    return (freshOnce ??= (async () => {
        const prev = await fs.readFile(VERSION_PATH, "utf8").catch(() => null);
        if (prev === VERSION) return; // 버전 그대로 → 유지
        await fs.rm(CACHE_ROOT, { recursive: true, force: true });
        await fs.mkdir(CACHE_ROOT, { recursive: true });
        await fs.writeFile(VERSION_PATH, VERSION);
    })());
}

async function readCached(date: string): Promise<DayReduction | null> {
    try {
        const buf = await fs.readFile(filePath(date));
        return JSON.parse((await gunzipAsync(buf)).toString("utf8")) as DayReduction;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
    }
}

async function writeCached(data: DayReduction): Promise<void> {
    const fp = filePath(data.date);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const gz = await gzipAsync(Buffer.from(JSON.stringify(data), "utf8"));
    await fs.writeFile(fp, gz);
}

// 같은 미캐시 날짜의 동시 요청이 중복 빌드하지 않게 in-flight 를 공유한다(idempotent 라 정합엔 무해, 낭비만 방지).
const inFlight = new Map<string, Promise<DayReduction>>();

/**
 * date 축약물을 캐시에서 읽거나, 없으면 build 로 계산 후 저장하고 반환.
 * build 는 raw 일봉·분봉을 순회하는 비싼 계산 — 캐시 히트면 아예 호출 안 됨.
 */
export async function getOrBuildDayReduction(
    date: string,
    build: (date: string) => Promise<DayReduction>,
): Promise<DayReduction> {
    await ensureFresh();
    const cached = await readCached(date);
    if (cached) return cached;

    const existing = inFlight.get(date);
    if (existing) return existing;

    const p = (async (): Promise<DayReduction> => {
        const data = await build(date);
        await writeCached(data).catch(() => {}); // 저장 실패는 조용히 — 다음 요청이 재빌드하면 됨
        return data;
    })();
    inFlight.set(date, p);
    try {
        return await p;
    } finally {
        inFlight.delete(date);
    }
}
