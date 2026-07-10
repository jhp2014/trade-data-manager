import { policy } from "./config";
import { runPgTool, withClient } from "./pg";
import { listBaseTables, minuteMonthlyFingerprint, tableCounts } from "./inspect";
import type { Manifest, MonthFingerprint } from "./manifest";
import type { Logger } from "./logger";

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
 * 실패하면 throw (호출부가 백업을 미인정 처리). 임시 DB 는 항상 정리.
 */
export async function verifyBackup(
    dumpPath: string,
    sourceCounts: Record<string, string>,
    manifest: Manifest,
    log: Logger,
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

            // ②b 행수 불감소 (append-only 가드 테이블만)
            for (const key of policy.guardTables) {
                const prev = manifest.lastCounts[key];
                if (prev !== undefined) {
                    assert(
                        BigInt(newCounts[key]) >= BigInt(prev),
                        `②b 행수 감소 감지: ${key} 직전 ${prev} → 현재 ${newCounts[key]} (데이터 유실 의심)`,
                    );
                }
            }
            log.info("②b 행수 불감소 가드 통과");

            // ③ 분봉 과거월 지문 불감소
            const newMonthly = await minuteMonthlyFingerprint(c);
            for (const [ym, prev] of Object.entries(manifest.minuteMonthly)) {
                const cur = newMonthly[ym];
                assert(cur !== undefined, `③ 과거월 통째 소실: ${ym}`);
                assert(
                    BigInt(cur.rows) >= BigInt(prev.rows),
                    `③ ${ym} 행수 감소 ${prev.rows}→${cur.rows} (유실 의심)`,
                );
                assert(
                    BigInt(cur.sumOhlc) >= BigInt(prev.sumOhlc),
                    `③ ${ym} OHLC합 감소 (값 손상 의심)`,
                );
                assert(
                    BigInt(cur.sumVolume) >= BigInt(prev.sumVolume),
                    `③ ${ym} 거래량합 감소 (값 손상 의심)`,
                );
            }
            log.info(
                `③ 분봉 과거월 지문 통과 (${Object.keys(manifest.minuteMonthly).length}개월 비교)`,
            );

            return { newCounts, newMonthly };
        });
    } finally {
        await dropTempDb(log);
    }
}
