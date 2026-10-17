// /dates 의 파일 물화 — tdm api 의 dataDatesCache.ts 에서 결 그대로. "캐시 기구"가 아니라 **재생성 가능한
// 파생 값의 물화**다(결정 로그 「trade-lab 편입」: 판단=정본·git vs 물화=.cache·git 제외·지워도 됨) —
// 무파일 풀스캔은 실측 6~20s 로 사용자 공유 DB 를 때리고, 메모리만 들면 tsx watch 재시작마다 그 비용을 다시 낸다.
//   cold: 분봉 전체 distinct 1회(≈수초~수십초) → 파일 저장
//   warm: 파일 read-through(과거 거래일은 append-only 라 불변 → 영구 유효)
//   꼬리: maxDate 초과분만 증분 스캔(월별 파티션 프루닝 → 최신 파티션 1개).
//   게이트: maxDate ≥ 오늘이면 스캔 생략. maxDate < 오늘이면 요청마다 재확인(저녁 수집분이 같은 날 밤 보이게).
// 파일 캐시 + 원자적 write + 자가치유(파일 삭제·손상 시 재빌드) idiom 도 api 와 동일.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kstToday, type MinuteDateReader } from "@trade-data-manager/market";

// 기본 경로는 cwd 가 아니라 앱 루트(apps/lab-api/.cache) 고정 — 어디서 띄워도 같은 파일을 본다.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_FILE = process.env.LAB_API_DATES_CACHE_FILE ?? path.resolve(APP_ROOT, ".cache/data-dates.json");

interface MaterializedFile {
    /** 분봉 있는 거래일(YYYY-MM-DD, 오름차순). */
    dates: string[];
    /** = last(dates). 다음 꼬리 증분의 하한(`> maxDate`). 빈 물화면 null. */
    maxDate: string | null;
}

export class MaterializedDataDates {
    private inFlight: Promise<string[]> | null = null;

    constructor(
        private readonly reader: MinuteDateReader,
        private readonly file: string = DEFAULT_FILE,
        /** 오늘(KST) 공급자 — 거래일 비교의 기준. 테스트 주입용. */
        private readonly today: () => string = kstToday,
    ) {}

    async list(): Promise<string[]> {
        const file = await this.read();
        // warm & 최신 — 오늘 데이터까지 들어왔으면 그날은 더 나올 게 없다: 스캔 없이 즉시.
        if (file && file.maxDate !== null && file.maxDate >= this.today()) return file.dates;
        // cold(파일 없음) 또는 꼬리 갱신 — 동시 요청은 한 번의 스캔으로 묶는다.
        if (!this.inFlight) {
            this.inFlight = this.refresh(file).finally(() => {
                this.inFlight = null;
            });
        }
        return this.inFlight;
    }

    private async refresh(file: MaterializedFile | null): Promise<string[]> {
        // cold: 전체 distinct. warm: maxDate 초과만(파티션 프루닝으로 최신 파티션 1개).
        const fresh = await this.reader.listMinuteDates(file?.maxDate ?? undefined);
        const dates = file ? mergeSorted(file.dates, fresh) : fresh;
        // 저장은 best-effort — 목록은 이미 메모리에 완성돼 있다. 디스크 실패로 응답까지 죽이지 않는다.
        try {
            await this.write({ dates, maxDate: dates.length > 0 ? dates[dates.length - 1] : null });
        } catch (err) {
            console.warn(`[data-dates] 물화 쓰기 실패 — 메모리 결과는 그대로 서빙: ${this.file}`, err);
        }
        return dates;
    }

    private async read(): Promise<MaterializedFile | null> {
        try {
            return JSON.parse(await fs.readFile(this.file, "utf8")) as MaterializedFile;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
            // 손상(JSON 실패 등) — throw 로 /dates 를 영구히 막는 대신 치우고 cold 재빌드(자가치유).
            console.warn(`[data-dates] 손상 물화 삭제 후 재빌드: ${this.file}`, err);
            await fs.rm(this.file, { force: true });
            return null;
        }
    }

    private async write(data: MaterializedFile): Promise<void> {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        // temp+rename(원자적) — 쓰기 도중 크래시가 truncate 된 파일을 남겨 이후 read 가 영구히 깨지는 걸 막는다.
        const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs.writeFile(tmp, JSON.stringify(data), "utf8");
            await fs.rename(tmp, this.file);
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
