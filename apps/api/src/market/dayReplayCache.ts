// 복기 파생값(MinuteDerived) 파일 캐시 — 저수준 read/write 만. build 조율(공유 fetch·in-flight dedup)은 DerivedStore.
// 과거 거래일은 immutable 이고 로직도 사실상 고정(특히 분봉 거래대금 공식)이라 자동 무효화(버전)는 두지 않는다.
//
// ⚠ 캐시 무효화: 아래 중 하나라도 바꾸면 이 캐시가 낡는다 → DAY_REPLAY_CACHE_DIR(기본 .cache/day-replay/)를
//    통째로 삭제해 재빌드를 유도할 것. 손으로 지우는 게 규칙(거의 바뀔 일 없어서 자동화가 오히려 과함).
//    · DayReplay / MinuteDerived 응답 스키마 — 필드 추가·이름·타입 변경
//    · deriveMinutes 계산 — base(직전 원주가 종가) 기준 %·running 고저·open·cumAmount·minuteOpen/High·trailingHighs·시각(kstToUnix)
//    · core/market 공유 로직 — densify(candle/minuteBackfill)·분봉 거래대금(candle/price)
//      (버킷/카운팅정책(board/amount)은 파일에 안 굽고 요청 때 file 에서 재계산 → 정책 변경은 이 파일 삭제와 무관)
// DB 아님: 재생성 가능한 파생물이라 진실원천(market 스키마)의 "본질만 저장" 잠금과 무관.
import { promises as fs } from "node:fs";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import type { DayReplay } from "@trade-data-manager/market";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const CACHE_ROOT = process.env.DAY_REPLAY_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/day-replay");

function filePath(date: string): string {
    return path.join(CACHE_ROOT, `${date}.json.gz`);
}

/** 파일에서 복기 파생 번들을 읽는다. 없으면 null(ENOENT). */
export async function readReplay(date: string): Promise<DayReplay | null> {
    try {
        const buf = await fs.readFile(filePath(date));
        return JSON.parse((await gunzipAsync(buf)).toString("utf8")) as DayReplay;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
    }
}

/** 복기 파생 번들을 gzip 파일로 저장한다. */
export async function writeReplay(data: DayReplay): Promise<void> {
    const fp = filePath(data.date);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const gz = await gzipAsync(Buffer.from(JSON.stringify(data), "utf8"));
    await fs.writeFile(fp, gz);
}
