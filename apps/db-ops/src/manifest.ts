import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

const FILE_NAME = "backup-manifest.json";

/**
 * manifest 스키마 버전. 옛 public 스키마(surrogate id·거래대금 저장) 기준으로 쓰인 v1 은
 * 현행 market/curation 스키마와 지문·카운트 키가 비호환이라, 버전이 다르면 통째로 폐기하고
 * 첫 성공 실행이 새 baseline 을 세운다(스테일 지문으로 인한 ③ 오탐 방지).
 */
const CURRENT_VERSION = 2;

export interface MonthFingerprint {
    rows: string;
    /** sum(open_un + high_un + low_un + close_un) — 저장 raw(UN) 기준. */
    sumOhlc: string;
    /** sum(volume_un). 거래대금은 현행 스키마에서 미저장(파생)이라 지문에서 빠짐. */
    sumVolume: string;
}

export interface Manifest {
    /** 포맷 버전. CURRENT_VERSION 과 다르면 readManifest 가 폐기. */
    version: number;
    /** 마지막 검증 성공 시각 (ISO) */
    lastSuccessAt: string | null;
    /** 직전 백업의 테이블별 count (schema.table 키) — 변경 감지 + ②b 가드 기준 */
    lastCounts: Record<string, string>;
    /** 직전 minute_candles max(trade_date) — 변경 감지("새 거래일 적재" 신호) */
    lastMinuteMaxDate: string | null;
    /** ③ 분봉 과거월 지문 (YYYY-MM → 지문) */
    minuteMonthly: Record<string, MonthFingerprint>;
    /** 검증 통과 시 기록한 덤프 파일 SHA-256 (파일명 → hash) */
    fileHashes: Record<string, string>;
}

export function emptyManifest(): Manifest {
    return {
        version: CURRENT_VERSION,
        lastSuccessAt: null,
        lastCounts: {},
        lastMinuteMaxDate: null,
        minuteMonthly: {},
        fileHashes: {},
    };
}

/** manifest 파일의 로컬 경로 (Drive 업로드 시에도 이 파일을 올린다). */
export function manifestPath(): string {
    return path.join(config.localDir, FILE_NAME);
}

/** 로컬 manifest 를 정본으로 읽는다. 없거나·손상·구버전이면 빈 manifest(=baseline 없음). */
export function readManifest(): Manifest {
    const p = manifestPath();
    if (fs.existsSync(p)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<Manifest>;
            // 구버전 manifest 는 지문/카운트 키가 비호환 → 폐기(첫 성공이 새 baseline).
            if (parsed.version === CURRENT_VERSION) return { ...emptyManifest(), ...parsed };
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
