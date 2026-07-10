import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { config, policy } from "./config";
import { sourceDbName, withClient } from "./pg";
import { restore } from "./restore";
import { createLogger } from "./logger";

export interface SetupOpts {
    /** market 시딩 덤프(로컬 경로). 없으면 로컬 최신 또는 --from-drive. */
    file?: string;
    fromDrive?: boolean;
    driveName?: string;
    /** 안전가드 — 없으면 dry-run. */
    yes: boolean;
}

/**
 * 새 머신 프로비저닝: 대상 DB 생성(없으면) + market 스키마 복원.
 * curation 은 로컬에 만들지 않는다 — 앱 curation 풀이 공유 Supabase 를 직접 쓰므로.
 * 전제: PostgreSQL 설치·실행 + DATABASE_URL 계정에 CREATEDB 권한 + PG_BIN_DIR.
 */
export async function setup(opts: SetupOpts): Promise<void> {
    fs.mkdirSync(config.localDir, { recursive: true });
    const log = createLogger(path.join(config.localDir, "logs"));
    const db = sourceDbName();

    if (!opts.yes) {
        log.info(`[DRY-RUN] setup 대상 DB='${db}' — 없으면 생성 후 market 복원. curation 은 Supabase 직접 사용(로컬 미러 X).`);
        log.info("⚠️ 진행하려면 --yes 를 붙이세요. (지금은 아무것도 안 함)");
        return;
    }

    // 1. 대상 DB 생성(없으면). 유지보수 DB(postgres)에 붙어 CREATE DATABASE(트랜잭션 밖 = 오토커밋).
    const exists = await withClient(policy.maintenanceDb, async (c) => {
        const r = await c.query("select 1 from pg_database where datname = $1", [db]);
        return (r.rowCount ?? 0) > 0;
    });
    if (exists) {
        log.info(`DB '${db}' 이미 존재 → 생성 생략`);
    } else {
        await withClient(policy.maintenanceDb, (c) => c.query(`CREATE DATABASE "${db}"`));
        log.info(`DB 생성: '${db}'`);
    }

    // 2. market 스키마 복원(restore 재사용). 새 DB 면 DROP SCHEMA IF EXISTS 는 no-op.
    await restore({
        file: opts.file,
        fromDrive: opts.fromDrive,
        driveName: opts.driveName,
        schema: "market",
        yes: true,
    });

    // 3. curation(Supabase) 접속 확인 — 로컬엔 안 만든다(앱 curation 풀 → Supabase).
    const curUrl = config.curationDatabaseUrl;
    if (curUrl) {
        try {
            const c = new Client({ connectionString: curUrl });
            await c.connect();
            await c.query("select 1");
            await c.end();
            log.info("curation(Supabase) 접속 OK — 앱은 curation 을 Supabase 에서 직접 사용.");
        } catch (e) {
            log.error(`curation(Supabase) 접속 실패 — CURATION_DATABASE_URL 확인: ${e instanceof Error ? e.message : String(e)}`);
        }
    } else {
        log.info("CURATION_DATABASE_URL 미설정 — curation 은 로컬 market DB 폴백(협업하려면 Supabase 스트링 설정).");
    }

    log.info("=== setup 완료 ===");
}
