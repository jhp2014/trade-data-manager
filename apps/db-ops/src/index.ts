import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { createLogger } from "./logger";
import { runBackup } from "./runBackup";
import { syncCuration } from "./syncCuration";

// db-ops CLI — DB 물리 운영(backup/mirror/restore/setup) 오케스트레이션.
// 공유 관심사는 infra 활용(@infra/persistence: DB URL, @infra/google: Drive), 운영 로직은 이 앱 안에.
// pg_dump/pg_restore 는 SQL 이 아니라 외부 바이너리 spawn(pg.ts), DROP SCHEMA·count 등은 SQL(withClient).

type Command = () => Promise<void>;

const commands: Record<string, Command> = {
    /** 전체 백업: 미러 pre-step → 로컬 덤프 → 복원검증 → Drive 업로드 → 보관정리. */
    backup: () => runBackup(),

    /** curation 미러만: Supabase→로컬 단방향 전체교체(백업 없이 로컬 curation 만 최신화). */
    mirror: async () => {
        fs.mkdirSync(config.localDir, { recursive: true });
        await syncCuration(createLogger(path.join(config.localDir, "logs")));
    },

    /** 덤프를 실 DB 로 복원(DR / 새 머신 시딩). ※미구현 — 뼈대만. */
    restore: async () => {
        throw new Error("restore: 미구현 — 덤프 파일을 실 DB 로 pg_restore(확인 가드 포함) 예정");
    },

    /** 새 머신 프로비저닝: DB 생성 + market 덤프 복원 + curation 미러. ※미구현 — 뼈대만. */
    setup: async () => {
        throw new Error("setup: 미구현 — DB 생성 + market 복원 + curation 미러 오케스트레이션 예정");
    },
};

const name = process.argv[2] ?? "backup";
const run = commands[name];
if (!run) {
    console.error(`알 수 없는 커맨드: ${name}\n사용: db-ops <backup|mirror|restore|setup>`);
    process.exit(1);
}
run().catch((err) => {
    console.error("[FATAL]", err);
    process.exitCode = 1;
});
