import { Command } from "commander";
import { db, pool } from "./db";
import { ProcessorRepository } from "./repository/processorRepository";
import { runMinuteFeatures } from "./runners/minuteRunner";
import { logger } from "./logger";

const program = new Command();

program
    .name("feature-processor")
    .description("분봉/일봉/테마 피처 가공 CLI")
    .version("1.0.0");

program
    .command("minute")
    .description("분봉 피처 가공")
    .option("-d, --date <date>", "특정 거래일만 처리 (YYYY-MM-DD)")
    .option("-a, --all", "모든 거래일 처리")
    .option("-p, --pending", "아직 가공되지 않은 거래일만 처리 (기본)")
    .action(async (opts) => {
        const repo = new ProcessorRepository(db);

        try {
            const dates = await resolveDates(repo, opts);
            if (dates.length === 0) {
                logger.info("처리할 거래일이 없습니다.");
                return;
            }

            logger.info(`처리 대상 거래일: ${dates.length}일`);
            for (const date of dates) {
                await runMinuteFeatures(repo, { tradeDate: date });
            }
            logger.info("모든 거래일 처리 완료");
        } catch (err) {
            logger.error("처리 중 에러 발생", err);
            process.exitCode = 1;
        } finally {
            await pool.end();
        }
    });

async function resolveDates(
    repo: ProcessorRepository,
    opts: { date?: string; all?: boolean; pending?: boolean }
): Promise<string[]> {
    if (opts.date) return [opts.date];
    if (opts.all) return repo.getAllTradeDates();
    // 기본: pending
    return repo.getPendingTradeDates();
}

program.parseAsync(process.argv);
