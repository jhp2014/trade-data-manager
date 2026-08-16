import fs from "node:fs";
import path from "node:path";
import { config, policy } from "./config";
import { sourceDbName, withClient } from "./pg";
import { restore } from "./restore";
import { syncCuration } from "./syncCuration";
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
 * 새 머신 프로비저닝: 대상 DB 생성(없으면) + market 스키마 복원 + **curation 미러 최초 적재**.
 *
 * 미러가 이제 앱의 **읽기 소스**다(옛 주석의 "로컬엔 안 만든다"는 뒤집혔다 — 그땐 앱이 Supabase 를
 * 직접 읽었다). 미러 없이 앱을 켜면 curation 조회가 전부 빈 결과가 되므로 여기서 함께 채운다.
 * 마이그레이션은 필요 없다 — 덤프가 DDL 을 들고 오므로 스키마째 재정의된다(협업자 PC 에서 할 일 0).
 *
 * 전제: PostgreSQL 설치·실행 + DATABASE_URL 계정에 CREATEDB 권한 + PG_BIN_DIR.
 */
export async function setup(opts: SetupOpts): Promise<void> {
    fs.mkdirSync(config.localDir, { recursive: true });
    const log = createLogger(path.join(config.localDir, "logs"));
    const db = sourceDbName();

    if (!opts.yes) {
        log.info(`[DRY-RUN] setup 대상 DB='${db}' — 없으면 생성 후 market 복원 + curation 미러 최초 적재.`);
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

    // 3. curation 미러 최초 적재(Supabase → 로컬). 앱의 읽기 소스라 이게 없으면 큐레이션이 전부 빈 화면이다.
    //    실패해도 setup 자체는 끝낸다 — market 은 이미 복원됐고, 미러는 앱에서 동기화 버튼으로 다시 받을 수 있다.
    try {
        await syncCuration(log);
    } catch (e) {
        log.error(`curation 미러 적재 실패 — 앱에서 동기화 버튼으로 다시 시도하세요: ${e instanceof Error ? e.message : String(e)}`);
    }

    log.info("=== setup 완료 ===");
}
