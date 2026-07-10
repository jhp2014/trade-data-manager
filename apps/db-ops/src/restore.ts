import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { parseConn, runPgToolOn, sourceDbName, withClient } from "./pg";
import { listLocalDumpNames, pickLatestDump } from "./retention";
import * as gdrive from "./gdrive";
import { createLogger, type Logger } from "./logger";

export interface RestoreOpts {
    /** 명시 로컬 덤프 경로. 없으면 로컬 최신 또는 --from-drive. */
    file?: string;
    /** Drive 에서 받아 복원. */
    fromDrive?: boolean;
    /** Drive 특정 덤프명(없으면 Drive 최신). */
    driveName?: string;
    /** 복원 범위: "market"(기본) | "all"(전체 DB) | 임의 스키마명. */
    schema: string;
    /** 안전가드 — 없으면 dry-run(아무것도 안 함). */
    yes: boolean;
}

/** 다운로드 없이 복원할 덤프의 소스를 식별(가드 메시지용). */
async function identifySource(
    opts: RestoreOpts,
): Promise<{ name: string; localPath?: string; drive?: { id: string; name: string } }> {
    if (opts.file) {
        if (!fs.existsSync(opts.file)) throw new Error(`덤프 파일 없음: ${opts.file}`);
        return { name: path.basename(opts.file), localPath: opts.file };
    }
    if (opts.fromDrive) {
        const files = await gdrive.listFiles();
        const name = opts.driveName ?? pickLatestDump(files.map((f) => f.name));
        if (!name) throw new Error("Drive 에 복원할 덤프가 없음");
        const file = files.find((f) => f.name === name);
        if (!file) throw new Error(`Drive 에 덤프 없음: ${name}`);
        return { name, drive: { id: file.id, name } };
    }
    const latest = pickLatestDump(listLocalDumpNames());
    if (!latest) throw new Error(`로컬(${config.localDir})에 덤프가 없음 — 파일 경로 지정 또는 --from-drive`);
    return { name: latest, localPath: path.join(config.localDir, latest) };
}

/** 덤프를 실 DB 로 복원. 기본 market 스키마만(파티션·데이터 보존), --schema all 이면 전체. */
export async function restore(opts: RestoreOpts): Promise<void> {
    fs.mkdirSync(config.localDir, { recursive: true });
    const log = createLogger(path.join(config.localDir, "logs"));
    const db = sourceDbName();

    const src = await identifySource(opts);
    const scopeDesc = opts.schema === "all" ? "전체 DB" : `스키마 '${opts.schema}'`;

    // 안전가드 — 실 DB 를 덮어쓰므로 --yes 없으면 대상만 출력하고 중단.
    if (!opts.yes) {
        log.info(
            `[DRY-RUN] 복원 대상 DB='${db}', 범위=${scopeDesc}, 덤프='${src.name}'${src.drive ? " (Drive)" : ""}`,
        );
        log.info("⚠️ 실행하면 위 범위를 덮어씁니다. 진행하려면 --yes 를 붙이세요. (지금은 아무것도 안 함)");
        return;
    }

    // 소스 자재화 — Drive 면 임시로 내려받는다.
    let dumpPath: string;
    let cleanup = false;
    if (src.localPath) {
        dumpPath = src.localPath;
    } else {
        dumpPath = path.join(config.localDir, `_restore_${src.drive!.name}`);
        log.info(`Drive 에서 덤프 다운로드: ${src.drive!.name}`);
        await gdrive.downloadTo(src.drive!.id, dumpPath);
        cleanup = true;
    }

    try {
        await runRestore(opts.schema, dumpPath, db, log);
        log.info("=== 복원 완료 ===");
    } finally {
        if (cleanup && fs.existsSync(dumpPath)) fs.rmSync(dumpPath);
    }
}

async function runRestore(schema: string, dumpPath: string, db: string, log: Logger): Promise<void> {
    if (schema === "all") {
        log.info(`전체 DB 복원: ${path.basename(dumpPath)} → '${db}'`);
        await runPgToolOn("pg_restore", parseConn(db), [
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            dumpPath,
        ]);
        return;
    }
    log.info(`스키마 '${schema}' 복원: ${path.basename(dumpPath)} → '${db}'`);
    // 대상 스키마 통째 교체. pg_restore 에 -n 을 주면 CREATE SCHEMA 엔트리가 걸러지므로 미리 만든다.
    await withClient(db, async (c) => {
        await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await c.query(`CREATE SCHEMA "${schema}"`);
    });
    await runPgToolOn("pg_restore", parseConn(db), [
        "--no-owner",
        "--no-privileges",
        "-n",
        schema,
        dumpPath,
    ]);
}
