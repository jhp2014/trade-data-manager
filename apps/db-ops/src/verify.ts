import { policy } from "./config";
import { runPgTool, withClient } from "./pg";
import { listBaseTables, minuteMonthlyFingerprint, tableCounts } from "./inspect";
import type { Manifest, MonthFingerprint } from "./manifest";
import type { Logger } from "./logger";
import { checkMinuteMonthly, rebaselineRowDrop } from "./rebaseline";

const MINUTE_TABLE = "market.minute_candles";

export interface VerifyResult {
    newCounts: Record<string, string>;
    newMonthly: Record<string, MonthFingerprint>;
}

function assert(cond: boolean, msg: string): void {
    if (!cond) throw new Error(msg);
}

async function dropTempDb(log: Logger): Promise<void> {
    await withClient(policy.maintenanceDb, async (c) => {
        // PG13+ : 접속이 남아있어도 강제 종료 후 삭제
        await c.query(`DROP DATABASE IF EXISTS "${policy.tempDbName}" WITH (FORCE)`);
    });
    log.info(`임시 DB 삭제: ${policy.tempDbName}`);
}

async function createTempDb(log: Logger): Promise<void> {
    await withClient(policy.maintenanceDb, async (c) => {
        await c.query(`CREATE DATABASE "${policy.tempDbName}"`);
    });
    log.info(`임시 DB 생성: ${policy.tempDbName}`);
}

/**
 * 방금 만든 덤프를 임시 DB 에 복구해 4단 검증.
 *  ① pg_restore 성공
 *  ②a 원본 == 복구본 count (전 핵심 테이블)
 *  ②b append-only 테이블 행수 불감소 (직전 백업 대비)
 *  ③ 분봉 과거월 지문 불감소 (값 손상/유실 감지, 신규 append 는 허용)
 * rebaseline = 일부러 바꾼 과거월(`backup --rebaseline`) — ③ 비교를 건너뛰고 ②b minute_candles 는 그 달에서 준 행수만큼만 허용.
 * 실패하면 throw (호출부가 백업을 미인정 처리). 임시 DB 는 항상 정리.
 */
export async function verifyBackup(
    dumpPath: string,
    sourceCounts: Record<string, string>,
    manifest: Manifest,
    log: Logger,
    rebaseline: ReadonlySet<string> = new Set(),
): Promise<VerifyResult> {
    await dropTempDb(log); // 잔재 정리
    await createTempDb(log);
    try {
        // ① restore
        await runPgTool("pg_restore", policy.tempDbName, [
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            dumpPath,
        ]);
        log.info("① pg_restore 성공");

        return await withClient(policy.tempDbName, async (c) => {
            // 복구본의 전 base 테이블을 런타임 열거해 count (원본 열거와 동일 규칙).
            const newCounts = await tableCounts(c, await listBaseTables(c));

            // ②a 정합성 — 원본 열거 키 전부가 복구본에 같은 count 로 존재해야 한다.
            for (const [key, srcCount] of Object.entries(sourceCounts)) {
                assert(key in newCounts, `②a 테이블 소실: ${key} 가 복구본에 없음`);
                assert(
                    newCounts[key] === srcCount,
                    `②a 정합성 실패: ${key} 원본 ${srcCount} ≠ 복구본 ${newCounts[key]}`,
                );
            }
            log.info(`②a restore 정합성(원본=복구본, ${Object.keys(sourceCounts).length}개 테이블) 통과`);

            // ③ 지문을 먼저 잰다 — ②b 의 minute_candles 허용 감소폭(재기준 달에서 준 행수)이 여기서 나온다.
            const newMonthly = await minuteMonthlyFingerprint(c);
            const rowAllowance = rebaselineRowDrop(rebaseline, manifest.minuteMonthly, newMonthly);

            // ②b 행수 불감소 (append-only 가드 테이블만)
            for (const key of policy.guardTables) {
                const prev = manifest.lastCounts[key];
                if (prev !== undefined) {
                    const allow = key === MINUTE_TABLE ? rowAllowance : 0n;
                    assert(
                        BigInt(newCounts[key]) >= BigInt(prev) - allow,
                        `②b 행수 감소 감지: ${key} 직전 ${prev} → 현재 ${newCounts[key]}${allow > 0n ? ` (재기준 허용 ${allow}행 초과)` : ""} (데이터 유실 의심)`,
                    );
                }
            }
            log.info(`②b 행수 불감소 가드 통과${rowAllowance > 0n ? ` (minute_candles 재기준 허용 ${rowAllowance}행)` : ""}`);

            // ③ 분봉 과거월 지문 불감소 (재기준 달은 바뀐 폭만 기록)
            for (const note of checkMinuteMonthly(manifest.minuteMonthly, newMonthly, rebaseline)) log.info(note);
            const months = Object.keys(manifest.minuteMonthly);
            const rebased = months.filter((ym) => rebaseline.has(ym)).length;
            log.info(
                `③ 분봉 과거월 지문 통과 (${months.length - rebased}개월 비교${rebased > 0 ? ` · ${rebased}개월 재기준` : ""})`,
            );

            return { newCounts, newMonthly };
        });
    } finally {
        await dropTempDb(log);
    }
}
