// DataDatesCache — data-aware 날짜피커의 "분봉(장중 데이터) 있는 거래일" 목록(전역·종목무관).
//   cold: 분봉 전체 distinct 1회(≈수초) → 파일 저장
//   warm: 파일 read-through(과거 거래일은 append-only 라 불변 → 영구 유효)
//   꼬리: maxDate 초과분만 증분 스캔(월별 파티션 프루닝 → 최신 파티션 1개). 하루 1회로 게이팅.
// DerivedCache/daySnapshotCache 와 같은 idiom(파일 캐시 + 원자적 write + 자가치유: 파일 삭제 시 재빌드).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { DataDateReader, MinuteDateReader } from "@trade-data-manager/market";

const DEFAULT_CACHE_FILE = process.env.DATA_DATES_CACHE_FILE ?? path.resolve(process.cwd(), ".cache/data-dates.json");

interface CacheFile {
    /** 분봉 있는 거래일(YYYY-MM-DD, 오름차순). */
    dates: string[];
    /** = last(dates). 다음 꼬리 증분의 하한(`> maxDate`). 빈 캐시면 null. */
    maxDate: string | null;
    /** 마지막 꼬리 확인일(YYYY-MM-DD, 로컬). 같은 날 재스캔 방지(게이팅). */
    checkedAt: string;
}

// 로컬(KST 머신) 벽시계 날짜. api 서버가 데이터와 같은 타임존이라 거래일 비교에 충분.
function localToday(): string {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class DataDatesCache implements DataDateReader {
    private inFlight: Promise<string[]> | null = null;

    constructor(
        private readonly reader: MinuteDateReader,
        private readonly cacheFile: string = DEFAULT_CACHE_FILE,
    ) {}

    async listDataDates(): Promise<string[]> {
        const file = await this.read();
        const today = localToday();
        // warm & 최신 — 오늘 이미 확인했거나 maxDate 가 오늘 이상이면 스캔 없이 파일 즉시.
        if (file && (file.checkedAt === today || (file.maxDate !== null && file.maxDate >= today))) return file.dates;
        // cold(파일 없음) 또는 꼬리 갱신 — 동시 요청은 한 번의 스캔으로 묶는다.
        if (!this.inFlight) {
            this.inFlight = this.refresh(file, today).finally(() => {
                this.inFlight = null;
            });
        }
        return this.inFlight;
    }

    private async refresh(file: CacheFile | null, today: string): Promise<string[]> {
        // cold: 전체 distinct. warm: maxDate 초과만(파티션 프루닝으로 최신 파티션 1개).
        const fresh = await this.reader.listMinuteDates(file?.maxDate ?? undefined);
        const dates = file ? mergeSorted(file.dates, fresh) : fresh;
        await this.write({ dates, maxDate: dates.length > 0 ? dates[dates.length - 1] : null, checkedAt: today });
        return dates;
    }

    private async read(): Promise<CacheFile | null> {
        try {
            return JSON.parse(await fs.readFile(this.cacheFile, "utf8")) as CacheFile;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
            // 손상(JSON 실패 등) — throw 로 날짜피커를 영구히 막는 대신 치우고 cold 재빌드(자가치유).
            console.warn(`[data-dates] 손상 캐시 삭제 후 재빌드: ${this.cacheFile}`, err);
            await fs.rm(this.cacheFile, { force: true });
            return null;
        }
    }

    private async write(data: CacheFile): Promise<void> {
        await fs.mkdir(path.dirname(this.cacheFile), { recursive: true });
        // temp+rename(원자적) — 쓰기 도중 크래시가 truncate 된 파일을 남겨 이후 read 가 JSON 에러로 영구히 깨지는 걸 막는다.
        const tmp = `${this.cacheFile}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.writeFile(tmp, JSON.stringify(data), "utf8");
            await fs.rename(tmp, this.cacheFile);
        } catch (err) {
            await fs.rm(tmp, { force: true });
            throw err;
        }
    }
}

// 둘 다 오름차순. fresh 는 `> maxDate` 라 원칙상 disjoint 지만, 방어적으로 Set 합병+정렬(≤수백 개라 무비용).
function mergeSorted(a: string[], b: string[]): string[] {
    if (b.length === 0) return a;
    return [...new Set([...a, ...b])].sort();
}
