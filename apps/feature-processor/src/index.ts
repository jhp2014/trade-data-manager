import { Command } from "commander";
import {
    getAllTradeDates,
    getPendingTradeDates,
    runMinuteFeatures,
    resolveDeckSubDir,
    loadDecksFromDir,
    analyzeEntries,
} from "@trade-data-manager/data-core";
import { pool, db } from "./repository/db";
import { logger } from "./logger";

const program = new Command();

program
    .name("feature-processor")
    .description("분봉 피처 가공 및 덱 분석 CLI")
    .version("1.0.0");

/* ===========================================================
 * minute — 분봉 피처 가공
 * =========================================================== */
program
    .command("minute")
    .description("분봉 피처 가공")
    .option("-d, --date <date>", "특정 거래일만 처리 (YYYY-MM-DD)")
    .option("-a, --all", "모든 거래일 처리")
    .option("-p, --pending", "아직 가공되지 않은 거래일만 처리 (기본)")
    .action(async (opts) => {
        try {
            const dates = await resolveDates(opts);
            if (dates.length === 0) {
                logger.info("처리할 거래일이 없습니다.");
                return;
            }
            logger.info(`처리 대상 거래일: ${dates.length}일`);
            for (const date of dates) {
                await runMinuteFeatures({ db, tradeDate: date });
            }
            logger.info("모든 거래일 처리 완료");
        } catch (err) {
            logger.error("처리 중 에러 발생", err);
            process.exitCode = 1;
        } finally {
            await pool.end();
        }
    });

/* ===========================================================
 * analyze — 덱 분석
 * =========================================================== */
program
    .command("analyze")
    .description("덱 디렉토리를 로드해 분봉 피처와 동반주를 분석")
    .requiredOption(
        "--dir <subPath>",
        "DECKS_DIR 기준 하위 경로 (예: 2026-04 또는 돌파/신고가)"
    )
    .action(async (opts) => {
        try {
            const absDir = resolveDeckSubDir(opts.dir);
            logger.info(`덱 디렉토리 로드: ${absDir}`);

            const decks = await loadDecksFromDir(absDir);
            logger.info(
                `파일 ${decks.files.length}개, entries ${decks.entries.length}개 로드` +
                (decks.duplicateCount > 0
                    ? ` (중복 ${decks.duplicateCount}개 제거)`
                    : "")
            );
            logger.info(`옵션 컬럼: [${decks.optionKeys.join(", ")}]`);

            if (decks.entries.length === 0) {
                logger.warn("분석할 entry가 없습니다.");
                return;
            }

            logger.info("분봉 피처 + 동반 종목 조회 중...");
            const analyzed = await analyzeEntries(db, decks.entries);

            const withSelf = analyzed.filter((a) => a.self !== null).length;
            const totalPeers = analyzed.reduce(
                (sum, a) =>
                    sum + a.themePeers.reduce((s, t) => s + t.peers.length, 0),
                0
            );

            logger.info(`결과 요약:`);
            logger.info(`  - entries: ${analyzed.length}`);
            logger.info(`  - 분봉 피처 매칭: ${withSelf}/${analyzed.length}`);
            logger.info(`  - 동반 종목 분봉 피처 합계: ${totalPeers}건`);

            // 첫 entry 샘플 출력
            if (analyzed.length > 0) {
                const first = analyzed[0];
                logger.info(`첫 entry 샘플:`);
                logger.info(
                    `  ${first.entry.stockCode} ${first.entry.tradeDate} ${first.entry.tradeTime}`
                );
                logger.info(`  options: ${JSON.stringify(first.entry.options)}`);
                logger.info(
                    `  self: ${first.self ? "있음" : "없음"}`
                );
                logger.info(
                    `  themePeers: ${first.themePeers
                        .map((t) => `${t.themeName}(${t.peers.length})`)
                        .join(", ") || "(없음)"}`
                );
            }
        } catch (err) {
            logger.error("분석 중 에러 발생", err);
            process.exitCode = 1;
        } finally {
            await pool.end();
        }
    });

async function resolveDates(opts: {
    date?: string;
    all?: boolean;
    pending?: boolean;
}): Promise<string[]> {
    if (opts.date) return [opts.date];
    if (opts.all) return getAllTradeDates(db);
    return getPendingTradeDates(db);
}

program.parseAsync(process.argv);
