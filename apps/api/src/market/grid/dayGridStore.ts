// 날짜 격자 파일 저장소 — `{date}.json.gz` 저수준 read/write 만(빌드 조율·게이트는 DayGrids).
// 번들을 **와이어 모양 그대로** 굳힌다 — warm 요청은 파싱한 봉투를 그대로 돌려준다(재인코딩 0).
// gzip 인 이유: 날짜당 ~2.4MB raw(1% 피벗 1만~1.7만 + 사건 전부) × 굳는 날짜 수라 평문 격자 캐시
// (/point-grids — 날짜당 ~21차트)와 규모가 다르다. 스냅샷(day-snapshot)과 같은 선택.
import { promises as fs } from "node:fs";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";
import { DAY_GRID_DETECT_OPTIONS, POINT_GRID_RULE_VERSION } from "@trade-data-manager/market";
import type { DayGridBundle } from "@trade-data-manager/wire";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** 파일 봉투 버전(모양). 검출 규칙은 봉투 안 `version`, 굽기 옵션은 `opts` — 셋 중 하나라도 다르면 miss. */
export const DAY_GRID_FILE_VERSION = 1;

export interface DayGridFile extends DayGridBundle {
    v: number;
}

export interface DayGridStore {
    read(date: string): Promise<DayGridBundle | null>;
    write(bundle: DayGridBundle): Promise<void>;
}

/** 이 파일이 지금 규칙·옵션으로 구운 것인가 — 아니면 miss(다음 빌드가 덮어쓴다 = 자가치유). */
export function isCurrentDayGridFile(f: Partial<DayGridFile>): boolean {
    const o = f.opts;
    return f.v === DAY_GRID_FILE_VERSION
        && f.version === POINT_GRID_RULE_VERSION
        && o !== undefined
        && o.zigzagPct === DAY_GRID_DETECT_OPTIONS.zigzagPct
        && o.floorEok === DAY_GRID_DETECT_OPTIONS.floorEok
        && o.approachPct === DAY_GRID_DETECT_OPTIONS.approachPct;
}

export function fileDayGridStore(
    root: string = process.env.DAY_GRID_CACHE_DIR ?? path.resolve(process.cwd(), ".cache/day-grid"),
): DayGridStore {
    const filePath = (date: string): string => path.join(root, `${date}.json.gz`);
    return {
        async read(date) {
            try {
                const parsed = JSON.parse((await gunzipAsync(await fs.readFile(filePath(date)))).toString("utf8")) as DayGridFile;
                if (!isCurrentDayGridFile(parsed)) return null;
                const { v: _v, ...bundle } = parsed;
                return bundle;
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
                console.warn(`[day-grid] 캐시 읽기 실패, 재굽기: ${filePath(date)}`, err);
                return null;
            }
        },
        async write(bundle) {
            await fs.mkdir(root, { recursive: true });
            const file: DayGridFile = { v: DAY_GRID_FILE_VERSION, ...bundle };
            // 원자적 교체 — 쓰는 도중 읽기가 반쪽 gzip 을 보지 않게(스냅샷 저장소와 같은 수법).
            const tmp = `${filePath(bundle.date)}.${process.pid}.tmp`;
            await fs.writeFile(tmp, await gzipAsync(Buffer.from(JSON.stringify(file), "utf8")));
            await fs.rename(tmp, filePath(bundle.date));
        },
    };
}
