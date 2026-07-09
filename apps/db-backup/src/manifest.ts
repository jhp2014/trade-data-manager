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

/** manifest 파일의 로컬 경로 (Drive 업로드 시에도 이 파일을 올린다). */
export function manifestPath(): string {
    return path.join(config.localDir, FILE_NAME);
}

/** 로컬 manifest 를 정본으로 읽는다. 없거나 손상되면 빈 manifest. */
export function readManifest(): Manifest {
    const p = manifestPath();
    if (fs.existsSync(p)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<Manifest>;
            return { ...emptyManifest(), ...parsed };
        } catch {
            /* 손상 시 빈 manifest 로 폴백 */
        }
    }
    return emptyManifest();
}

/** 로컬에 기록 (Drive 업로드는 호출부에서 manifestPath() 로 별도 수행). */
export function writeManifest(m: Manifest): void {
    fs.mkdirSync(config.localDir, { recursive: true });
    fs.writeFileSync(manifestPath(), JSON.stringify(m, null, 2), "utf-8");
}
