import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { createLogger } from "./logger";
import { runBackup } from "./runBackup";
import { syncCuration } from "./syncCuration";
import { restore } from "./restore";
import { setup } from "./setup";

// db-ops CLI — DB 물리 운영(backup/sync/restore/setup) 오케스트레이션.
// 공유 관심사는 infra 활용(@infra/persistence: DB URL, @infra/google: Drive), 운영 로직은 이 앱 안에.
// pg_dump/pg_restore 는 SQL 이 아니라 외부 바이너리 spawn(pg.ts), DROP SCHEMA·count 등은 SQL(withClient).

/** 아주 단순한 인자 파서: positional + `--flag` / `--flag value`. */
function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith("--")) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(a);
        }
    }
    return { positional, flags };
}

const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined);

async function main(): Promise<void> {
    const [cmd, ...rest] = process.argv.slice(2);
    const { positional, flags } = parseArgs(rest);

    switch (cmd ?? "backup") {
        // 전체 백업: sync(미러) pre-step → 로컬 덤프 → 복원검증 → Drive.
        case "backup":
            await runBackup();
            break;
        // curation 미러: Supabase→로컬 단방향 전체교체(백업 없이 로컬 curation 만 최신화).
        case "sync":
            fs.mkdirSync(config.localDir, { recursive: true });
            await syncCuration(createLogger(path.join(config.localDir, "logs")));
            break;
        // 덤프를 실 DB 로 복원(기본 market, --schema all 전체, --from-drive Drive). --yes 없으면 dry-run.
        case "restore":
            await restore({
                file: positional[0],
                fromDrive: flags["from-drive"] === true,
                driveName: str(flags["drive-name"]),
                schema: str(flags["schema"]) ?? "market",
                yes: flags["yes"] === true,
            });
            break;
        // 새 머신 프로비저닝: DB 생성 + market 복원(+curation 은 Supabase 직접). --yes 없으면 dry-run.
        case "setup":
            await setup({
                file: positional[0],
                fromDrive: flags["from-drive"] === true,
                driveName: str(flags["drive-name"]),
                yes: flags["yes"] === true,
            });
            break;
        default:
            console.error(`알 수 없는 커맨드: ${cmd}\n사용: db-ops <backup|sync|restore|setup> [옵션]`);
            process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error("[FATAL]", err);
    process.exitCode = 1;
});
