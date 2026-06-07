import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const FILE_NAME = "backup-manifest.json";

export interface MonthFingerprint {
    rows: string;
    sumOhlc: string;
    sumVolume: string;
    sumAmount: string;
}

export interface Manifest {
    /** 마지막 검증 성공 시각 (ISO) */
    lastSuccessAt: string | null;
    /** 직전 백업의 테이블별 count — 변경 감지 + ②b 가드 기준 */
    lastCounts: Record<string, string>;
    /** 직전 minute_candles max(id) — 변경 감지 */
    lastMinuteMaxId: string | null;
    /** ③ 분봉 과거월 지문 (YYYY-MM → 지문) */
    minuteMonthly: Record<string, MonthFingerprint>;
    /** 검증 통과 시 기록한 덤프 파일 SHA-256 (파일명 → hash) */
    fileHashes: Record<string, string>;
}

export function emptyManifest(): Manifest {
    return {
        lastSuccessAt: null,
        lastCounts: {},
        lastMinuteMaxId: null,
        minuteMonthly: {},
        fileHashes: {},
    };
}

/** mybox(정본) 우선 → local → 둘 다 없거나 손상되면 빈 manifest. */
export function readManifest(): Manifest {
    for (const dir of [config.myboxDir, config.localDir]) {
        const p = path.join(dir, FILE_NAME);
        if (fs.existsSync(p)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<Manifest>;
                return { ...emptyManifest(), ...parsed };
            } catch {
                /* 손상 시 다음 후보로 */
            }
        }
    }
    return emptyManifest();
}

/** local + mybox 양쪽에 기록. */
export function writeManifest(m: Manifest): void {
    const json = JSON.stringify(m, null, 2);
    for (const dir of [config.localDir, config.myboxDir]) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, FILE_NAME), json, "utf-8");
    }
}
