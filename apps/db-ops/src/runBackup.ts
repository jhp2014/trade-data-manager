import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { createLogger, type Logger } from "./logger";
import { sourceDbName, withClient } from "./pg";
import { syncCuration } from "./syncCuration";
import { listBaseTables, minuteMaxTradeDate, tableCounts } from "./inspect";
import {
    emptyManifest,
    manifestPath,
    readManifest,
    writeManifest,
    type Manifest,
} from "./manifest";
import { createDump, dumpFileName, md5, sha256 } from "./backup";
import { verifyBackup } from "./verify";
import { applyDriveRetention, applyLocalRetention, listLocalDumpNames } from "./retention";
import * as gdrive from "./gdrive";

const FAILED_MARKER = "LAST_RUN_FAILED.txt";

/** 두 count 맵이 완전히 동일한지(키집합 + 값). 테이블이 늘거나 값이 바뀌면 false → 덤프 트리거. */
function sameCounts(a: Record<string, string>, b: Record<string, string>): boolean {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}

/**
 * 전체 백업(db-ops `backup` 커맨드): curation 미러(Supabase→로컬) → 로컬 전체 덤프 →
 * 복원검증(임시DB) → Drive 업로드 → 보관정리. 자기 오류는 내부에서 잡아 실패 마커 + exitCode 로 처리.
 */
export async function runBackup(): Promise<void> {
    fs.mkdirSync(config.localDir, { recursive: true });
    const log = createLogger(path.join(config.localDir, "logs"));
    const markerPath = path.join(config.localDir, FAILED_MARKER);

    log.info(`=== DB 백업 시작: ${sourceDbName()} ===`);

    // curation 미러(Supabase→로컬) 먼저 — 실패해도 market 백업은 계속(curation 은 Supabase 자체가 원본 내구).
    try {
        await syncCuration(log);
    } catch (e) {
        log.error(`curation 미러 실패(백업은 계속 진행): ${e instanceof Error ? e.message : String(e)}`);
    }

    const manifest = readManifest();

    // 0. 현재 원본 상태 스냅샷 (변경 감지 + ②a 정합성 기준)
    const { sourceCounts, minuteMaxDate } = await withClient(sourceDbName(), async (c) => ({
        sourceCounts: await tableCounts(c, await listBaseTables(c)),
        minuteMaxDate: await minuteMaxTradeDate(c),
    }));

    const unchanged =
        manifest.lastSuccessAt !== null &&
        manifest.lastMinuteMaxDate === minuteMaxDate &&
        sameCounts(manifest.lastCounts, sourceCounts);

    let newDumpPath: string | null = null;
    let accepted = false; // 로컬 검증 통과 시 true → 이후 실패해도 격리하지 않음

    try {
        if (unchanged) {
            log.info("직전 백업 이후 변경 없음 → 새 덤프 생략");
        } else {
            // 1. 덤프 생성
            const fileName = dumpFileName();
            newDumpPath = path.join(config.localDir, fileName);
            await createDump(newDumpPath);
            const sizeMb = (fs.statSync(newDumpPath).size / 1024 / 1024).toFixed(1);
            log.info(`덤프 생성: ${fileName} (${sizeMb} MB)`);

            // 2. 검증 (실패 시 throw)
            const verify = await verifyBackup(newDumpPath, sourceCounts, manifest, log);
            accepted = true; // 로컬 검증 통과 = 유효 백업 확정

            // 3. 로컬 확정: SHA-256 + 보관정리 + manifest 갱신
            const hash = await sha256(newDumpPath);
            applyLocalRetention(log);
            const localExisting = new Set(listLocalDumpNames());
            const next: Manifest = {
                ...emptyManifest(),
                lastSuccessAt: new Date().toISOString(),
                lastCounts: verify.newCounts,
                lastMinuteMaxDate: minuteMaxDate,
                minuteMonthly: verify.newMonthly,
                fileHashes: Object.fromEntries(
                    Object.entries({ ...manifest.fileHashes, [fileName]: hash }).filter(([f]) =>
                        localExisting.has(f),
                    ),
                ),
            };
            writeManifest(next);
            log.info("로컬 보관 + manifest 갱신 완료");
        }

        // 4. Drive 동기화 (변경 여부와 무관하게 매번 → 지난 업로드 실패도 자동 재시도)
        await reconcileDrive(log);

        // 5. 전체 정상 → 실패 마커 제거
        if (fs.existsSync(markerPath)) fs.rmSync(markerPath);
        log.info("=== 백업 완료 ===");
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // 로컬 검증 전에 실패한 새 덤프만 격리 (이미 확정된 백업은 보존)
        if (!accepted && newDumpPath && fs.existsSync(newDumpPath)) {
            try {
                fs.renameSync(newDumpPath, newDumpPath.replace(/\.dump$/, ".failed.dump"));
            } catch {
                /* 격리 실패는 무시 */
            }
        }
        fs.writeFileSync(
            markerPath,
            `${new Date().toISOString()}\n실패: ${reason}\n→ 기존(확정) 백업은 보존됨.\n`,
            "utf-8",
        );
        log.error(`백업 실패. 사유: ${reason}`);
        process.exitCode = 1;
    }
}

/**
 * 로컬에 보관 중인 덤프를 Google Drive 에 단방향 반영한다.
 * - Drive 에 없는 로컬 덤프 업로드(md5 대조로 무결성 확인)
 * - Drive 보관 정책 적용
 * - manifest 업로드
 * 매 실행마다 호출되므로 이전 실행에서 업로드가 실패했어도 다음 실행에 따라잡는다.
 */
async function reconcileDrive(log: Logger): Promise<void> {
    const localDumps = listLocalDumpNames();
    const driveNames = new Set((await gdrive.listFiles()).map((f) => f.name));

    let uploaded = 0;
    for (const name of localDumps) {
        if (driveNames.has(name)) continue;
        const localPath = path.join(config.localDir, name);
        const res = await gdrive.uploadFile(localPath);
        const localMd5 = await md5(localPath);
        if (res.md5Checksum && res.md5Checksum !== localMd5) {
            await gdrive.deleteFile(res.id);
            throw new Error(`Drive 업로드 md5 불일치(손상): ${name}`);
        }
        uploaded++;
        log.info(`Drive 업로드: ${name} (md5 검증 통과)`);
    }
    if (uploaded === 0) log.info("Drive 업로드: 신규 없음(동기화 상태)");

    await applyDriveRetention(log);

    // manifest 도 오프사이트에 최신 유지 (SHA-256/지문 기록 보존)
    if (fs.existsSync(manifestPath())) {
        await gdrive.uploadOrUpdate(manifestPath());
        log.info("Drive manifest 갱신");
    }
}
