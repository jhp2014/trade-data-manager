import "dotenv/config";
import { program } from "commander";
import { loadConfig } from "../../capture.config";
import { runCapture } from "../pipeline/runCapture";
import { logger } from "../lib/logger";

program
    .name("chart-capture")
    .description("CSV 종목/날짜 목록을 받아 KRX/NXT 콤보 차트 PNG를 캡처합니다.")
    .option("-f, --file <name>", "특정 CSV 파일만 처리 (inputDir 기준 상대경로)")
    .option("--variant <KRX|NXT>", "한쪽 variant만 캡처")
    .option("--concurrency <n>", "동시 실행 수", parseInt)
    .option("--dry-run", "실제 캡처 없이 URL/파일명만 출력")
    .option("--dev", "next dev 모드로 기동")
    .option("--external-server <url>", "외부에서 띄운 Next 서버 사용 (디버그용)")
    .parse(process.argv);

const opts = program.opts<{
    file?: string;
    variant?: string;
    concurrency?: number;
    dryRun?: boolean;
    dev?: boolean;
    externalServer?: string;
}>();

async function main() {
    let config = loadConfig({
        concurrency: opts.concurrency,
        devMode: opts.dev ?? false,
        externalServerUrl: opts.externalServer,
    });

    if (opts.variant === "KRX") {
        config = { ...config, variants: ["KRX"] };
    } else if (opts.variant === "NXT") {
        config = { ...config, variants: ["NXT"] };
    }

    if (opts.file) {
        const path = await import("path");
        config = { ...config, inputDir: path.dirname(path.resolve(config.inputDir, opts.file)) };
    }

    const summary = await runCapture(config, opts.dryRun ?? false);

    // exit code 결정
    if (summary.failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

main().catch((err) => {
    logger.error(`[cli] 치명적 오류: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});

process.on("beforeExit", async () => {
    const { closeCaptureDb } = await import("../data/db");
    await closeCaptureDb();
});
