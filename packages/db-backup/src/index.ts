import fs from "node:fs";
import path from "node:path";
import { config, policy } from "./config";
import { createLogger } from "./logger";
import { sourceDbName, withClient } from "./pg";
import { minuteMaxId, tableCounts } from "./inspect";
import { emptyManifest, readManifest, writeManifest, type Manifest } from "./manifest";
import { copyToMybox, createDump, dumpFileName, sha256 } from "./backup";
import { verifyBackup } from "./verify";
import { applyRetention } from "./retention";

const FAILED_MARKER = "LAST_RUN_FAILED.txt";

async function main(): Promise<void> {
    fs.mkdirSync(config.localDir, { recursive: true });
    fs.mkdirSync(config.myboxDir, { recursive: true });
    const log = createLogger(path.join(config.localDir, "logs"));
    const markerPath = path.join(config.localDir, FAILED_MARKER);

    log.info(`=== DB 백업 시작: ${sourceDbName()} ===`);
    const manifest = readManifest();

    // 0. 현재 원본 상태 스냅샷 (변경 감지 + ②a 정합성 기준)
    const { sourceCounts, maxId } = await withClient(sourceDbName(), async (c) => ({
        sourceCounts: await tableCounts(c, policy.keyTables),
        maxId: await minuteMaxId(c),
    }));

    // 변경 없으면 스킵 (간헐 수집 → 동일 DB 중복 백업 방지)
    const unchanged =
        manifest.lastSuccessAt !== null &&
        manifest.lastMinuteMaxId === maxId &&
        policy.keyTables.every((t) => manifest.lastCounts[t] === sourceCounts[t]);
    if (unchanged) {
        log.info("직전 백업 이후 변경 없음 → 스킵");
        return;
    }

    const fileName = dumpFileName();
    const localPath = path.join(config.localDir, fileName);
    let accepted = false; // mybox 보관까지 끝나면 true → 이후 실패해도 격리하지 않음

    try {
        // 1. 덤프 생성
        await createDump(localPath);
        const sizeMb = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1);
        log.info(`덤프 생성: ${fileName} (${sizeMb} MB)`);

        // 2. 검증 (실패 시 throw)
        const verify = await verifyBackup(localPath, sourceCounts, manifest, log);

        // 3. 검증 통과 → SHA-256 → mybox 복사
        const hash = await sha256(localPath);
        const myboxPath = copyToMybox(localPath);
        accepted = true;
        log.info(`mybox 복사 완료: ${path.basename(myboxPath)} (SHA-256 ${hash.slice(0, 12)}…)`);

        // 4. 보관 정책 적용 (양쪽)
        applyRetention(log);

        // 5. manifest 갱신 (남아있는 파일 기준으로 해시 정리)
        const next: Manifest = {
            ...emptyManifest(),
            lastSuccessAt: new Date().toISOString(),
            lastCounts: verify.newCounts,
            lastMinuteMaxId: maxId,
            minuteMonthly: verify.newMonthly, // 불감소 검증 통과분 = 최신값
            fileHashes: pruneHashes({ ...manifest.fileHashes, [fileName]: hash }),
        };
        writeManifest(next);
        log.info("manifest 갱신 완료");

        // 6. 직전 실패 마커 제거
        if (fs.existsSync(markerPath)) fs.rmSync(markerPath);

        log.info("=== 백업 성공 ===");
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        // 미인정 백업 격리 (이미 mybox 보관된 경우는 건드리지 않음)
        if (!accepted && fs.existsSync(localPath)) {
            const failed = localPath.replace(/\.dump$/, ".failed.dump");
            try {
                fs.renameSync(localPath, failed);
            } catch {
                /* 격리 실패는 무시 */
            }
        }
        fs.writeFileSync(
            markerPath,
            `${new Date().toISOString()}\n백업 실패: ${reason}\n→ 기존 백업은 보존됨.\n`,
            "utf-8",
        );
        log.error(`백업 미인정, 기존 백업 보존. 사유: ${reason}`);
        process.exitCode = 1;
    }
}

/** mybox 에 실제로 존재하는 덤프의 해시만 남긴다 (보관 정리로 사라진 항목 제거). */
function pruneHashes(hashes: Record<string, string>): Record<string, string> {
    const existing = fs.existsSync(config.myboxDir)
        ? new Set(fs.readdirSync(config.myboxDir))
        : new Set<string>();
    return Object.fromEntries(Object.entries(hashes).filter(([f]) => existing.has(f)));
}

main().catch((err) => {
    console.error("[FATAL]", err);
    process.exitCode = 1;
});
