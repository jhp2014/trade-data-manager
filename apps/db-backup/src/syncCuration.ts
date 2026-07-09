import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { parseConn, parseConnFromUrl, runPgToolOn, sourceDbName, withClient } from "./pg";
import type { Logger } from "./logger";

/**
 * curation 미러 — 단방향 전체교체(Supabase → 로컬). db-backup 본작업 직전에 돈다.
 *   pg_dump -Fc -n curation (Supabase) → DROP SCHEMA curation CASCADE (로컬) → pg_restore (로컬).
 * 덤프에 스키마 DDL 이 포함되므로 로컬 curation 을 스키마째 재정의 → 드리프트 없음(로컬엔 curation 마이그 불필요).
 * 쓰기 단일소스는 Supabase 이고 로컬은 순수 미러라 단방향이 안전(로컬 편집분이 없어 손실 없음).
 * CURATION_DATABASE_URL 미설정이면 스킵(로컬 단독 운영 허용) — market 백업은 그대로 진행.
 * SSL: pg_dump 에 PGSSLMODE=require(libpq: 암호화·인증서검증 생략) — Supabase pooler 호환.
 */
export async function syncCuration(log: Logger): Promise<void> {
    if (!config.curationDatabaseUrl) {
        log.info("curation 미러 건너뜀 (CURATION_DATABASE_URL 미설정)");
        return;
    }
    const src = parseConnFromUrl(config.curationDatabaseUrl);
    const localDb = sourceDbName();
    const tmp = path.join(config.localDir, "_curation_mirror.dump");

    // 1. Supabase 의 curation 스키마 덤프(스키마+데이터, custom 포맷)
    await runPgToolOn(
        "pg_dump",
        src,
        ["-Fc", "-n", "curation", "--no-owner", "--no-privileges", "-f", tmp],
        { PGSSLMODE: "require" },
    );
    try {
        // 2. 로컬 curation 통째 제거 → 3. 복원(스키마+데이터). 단방향 전체교체.
        await withClient(localDb, (c) => c.query("DROP SCHEMA IF EXISTS curation CASCADE"));
        // pg_restore 에 -n 필터를 주지 않는다: 덤프가 이미 curation 전용이고, -n 을 주면 CREATE SCHEMA
        // 엔트리가 "curation 소속"이 아니라 걸러져 스키마가 안 생기고 CREATE TABLE 이 전부 실패한다.
        await runPgToolOn("pg_restore", parseConn(localDb), ["--no-owner", "--no-privileges", tmp]);

        const total = await withClient(localDb, (c) =>
            c
                .query(
                    "select coalesce(sum(n),0)::int total from (" +
                        "select count(*) n from curation.review_points " +
                        "union all select count(*) from curation.price_lines " +
                        "union all select count(*) from curation.daily_comments " +
                        "union all select count(*) from curation.hypotheses) x",
                )
                .then((r) => r.rows[0].total as number),
        );
        log.info(`curation 미러 완료: Supabase→로컬 (주요 4테이블 ${total}행)`);
    } finally {
        if (fs.existsSync(tmp)) fs.rmSync(tmp);
    }
}
