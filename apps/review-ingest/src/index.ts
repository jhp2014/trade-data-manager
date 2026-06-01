import { Command } from "commander";
import { closeDb, getDb } from "./repository/db";
import { ingestCaptureFolder } from "./ingestCapture";
import { ingestMainFolder } from "./ingestMain";
import { defaultCaptureDir, defaultMainDir } from "./paths";
import { logger } from "./logger";

const program = new Command();
const db = getDb();

program
  .name("review-ingest")
  .description("chart-review 대상 CSV 인제스트 CLI")
  .version("0.1.0");

program
  .command("capture")
  .description("Capture CSV 인박스를 review_target으로 적재하고 processed/로 이동")
  .option("--dir <path>", "Capture CSV 디렉터리")
  .action(async (opts: { dir?: string }) => {
    await runSafely(async () => ingestCaptureFolder(db, opts.dir ?? defaultCaptureDir()));
  });

program
  .command("main")
  .description("main CSV 원장을 review_target/review_point로 멱등 적재")
  .option("--dir <path>", "main CSV 루트 디렉터리")
  .action(async (opts: { dir?: string }) => {
    await runSafely(async () => ingestMainFolder(db, opts.dir ?? defaultMainDir()));
  });

program
  .command("all")
  .description("capture 먼저, main 다음 순서로 전체 인제스트")
  .option("--capture-dir <path>", "Capture CSV 디렉터리")
  .option("--main-dir <path>", "main CSV 루트 디렉터리")
  .action(async (opts: { captureDir?: string; mainDir?: string }) => {
    await runSafely(async () => {
      await ingestCaptureFolder(db, opts.captureDir ?? defaultCaptureDir());
      await ingestMainFolder(db, opts.mainDir ?? defaultMainDir());
    });
  });

async function runSafely(work: () => Promise<void>) {
  try {
    await work();
    logger.info("인제스트 완료");
  } catch (err) {
    logger.error("인제스트 실패", err);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

program.parseAsync(process.argv);
