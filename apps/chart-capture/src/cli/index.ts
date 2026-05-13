import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), "../../.env") });
import { program } from "commander";
import { loadConfig } from "../../capture.config";
import { runCapture } from "../pipeline/runCapture";
import { closeCaptureDb } from "../data/db";
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

async function main(): Promise<number> {
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

    const summary = await runCapture(config, {
        dryRun: opts.dryRun ?? false,
        onlyFile: opts.file,
    });

    return summary.failed > 0 ? 1 : 0;
}

main()
    .then(async (code) => {
        await closeCaptureDb();
        process.exit(code);
    })
    .catch(async (err) => {
        logger.error(`[cli] 치명적 오류: ${err instanceof Error ? err.message : String(err)}`);
        try {
            await closeCaptureDb();
        } catch {
            // 정리 실패는 무시
        }
        process.exit(2);
    });
