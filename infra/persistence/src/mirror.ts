import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDatabaseUrl, getCurationDatabaseUrl } from "./env.js";
import { parseConnFromUrl, runPgToolOn, withPgClient, type PgConn } from "./pgTool.js";

/**
 * curation 미러 — 단방향 전체교체(Supabase → 로컬).
 *   pg_dump -Fc -n curation (Supabase) → DROP SCHEMA curation CASCADE (로컬) → pg_restore (로컬).
 *
 * 덤프에 스키마 DDL 이 포함되므로 로컬 curation 을 스키마째 재정의한다 → 드리프트 0, 그리고
 * **로컬엔 마이그레이션 상태가 없다**(마이그레이션은 Supabase 에만 건다. 협업자 PC 는 할 일 없음).
 * 이 성질이 전체교체를 고수하는 이유다 — 무중단 스왑을 하려면 덤프에 박힌 스키마명을 바꿔야 하는데
 * pg_restore 가 리네임을 못 해서, 복잡도만 늘고 이 성질을 잃는다.
 *
 * 쓰기 단일소스는 Supabase 라 단방향이 안전하다(로컬 편집분이 없어 손실 없음).
 * 로컬 미러는 **앱의 읽기 소스**다 — db-ops 야간 백업과 api 동기화 버튼이 같은 함수를 부른다.
 */
export interface CurationMirrorOptions {
    /** pg_dump / pg_restore 가 있는 디렉터리 */
    pgBinDir: string;
    /** 임시 덤프 파일 위치. 기본 OS 임시 디렉터리(작업 끝에 지운다). */
    workDir?: string;
    /** 진행 로그. 없으면 침묵. */
    log?: (message: string) => void;
}

export interface CurationMirrorResult {
    /** 미러가 갱신된 시각. skipped 면 null. */
    syncedAt: Date | null;
    /** 주요 4테이블 합계 행수(로그·확인용). skipped 면 0. */
    rows: number;
    /** CURATION_DATABASE_URL 미설정 = 별도 원본 없음 → 아무것도 안 함. */
    skipped: boolean;
}

/** 동기화 시각 보관 — curation 스키마는 매번 교체되므로 그 바깥(public)에 둔다. */
const STATE_TABLE = `public.mirror_state`;
const STATE_KEY = "curation";

async function ensureStateTable(client: { query: (q: string) => Promise<unknown> }): Promise<void> {
    await client.query(
        `create table if not exists ${STATE_TABLE} (name text primary key, synced_at timestamptz not null)`,
    );
}

/** 로컬 미러의 마지막 동기화 시각. 한 번도 안 돌았으면 null. */
export async function readLastMirrorSyncAt(): Promise<Date | null> {
    const local = parseConnFromUrl(getDatabaseUrl());
    return withPgClient(local, async (c) => {
        await ensureStateTable(c);
        const r = await c.query(`select synced_at from ${STATE_TABLE} where name = '${STATE_KEY}'`);
        return r.rows.length > 0 ? (r.rows[0].synced_at as Date) : null;
    });
}

/** Supabase → 로컬 전체교체. 원본 URL 미설정이면 아무것도 안 하고 skipped 로 돌아온다. */
export async function syncCurationMirror(opts: CurationMirrorOptions): Promise<CurationMirrorResult> {
    const log = opts.log ?? (() => {});
    const sourceUrl = getCurationDatabaseUrl();
    if (!sourceUrl) {
        log("curation 미러 건너뜀 (CURATION_DATABASE_URL 미설정)");
        return { syncedAt: null, rows: 0, skipped: true };
    }

    const src = parseConnFromUrl(sourceUrl);
    const local = parseConnFromUrl(getDatabaseUrl());
    const workDir = opts.workDir ?? os.tmpdir();
    fs.mkdirSync(workDir, { recursive: true });
    const tmp = path.join(workDir, "_curation_mirror.dump");

    // 1. Supabase 의 curation 스키마 덤프(스키마+데이터, custom 포맷).
    //    깨지기 쉬운 네트워크 단계를 DROP 보다 먼저 둔다 — 실패해도 로컬은 손대지 않은 상태로 남는다.
    //    SSL: pg_dump 는 libpq 라 PGSSLMODE=require(암호화·인증서검증 생략)로 Supabase pooler 호환.
    await runPgToolOn(opts.pgBinDir, "pg_dump", src, ["-Fc", "-n", "curation", "--no-owner", "--no-privileges", "-f", tmp], {
        PGSSLMODE: "require",
    });

    try {
        const syncedAt = await replaceLocalSchema(local, tmp, opts.pgBinDir);
        const rows = await countMainTables(local);
        log(`curation 미러 완료: Supabase→로컬 (주요 4테이블 ${rows}행)`);
        return { syncedAt, rows, skipped: false };
    } finally {
        if (fs.existsSync(tmp)) fs.rmSync(tmp);
    }
}

async function replaceLocalSchema(local: PgConn, dumpPath: string, pgBinDir: string): Promise<Date> {
    await withPgClient(local, (c) => c.query("DROP SCHEMA IF EXISTS curation CASCADE"));
    // pg_restore 에 -n 필터를 주지 않는다: 덤프가 이미 curation 전용이고, -n 을 주면 CREATE SCHEMA
    // 엔트리가 "curation 소속"이 아니라 걸러져 스키마가 안 생기고 CREATE TABLE 이 전부 실패한다.
    await runPgToolOn(pgBinDir, "pg_restore", local, ["--no-owner", "--no-privileges", dumpPath]);

    return withPgClient(local, async (c) => {
        await ensureStateTable(c);
        const r = await c.query(
            `insert into ${STATE_TABLE} (name, synced_at) values ('${STATE_KEY}', now())
             on conflict (name) do update set synced_at = excluded.synced_at
             returning synced_at`,
        );
        return r.rows[0].synced_at as Date;
    });
}

async function countMainTables(local: PgConn): Promise<number> {
    return withPgClient(local, (c) =>
        c
            .query(
                "select coalesce(sum(n),0)::int total from (" +
                    "select count(*) n from curation.review_points " +
                    "union all select count(*) from curation.chart_anchors " +
                    "union all select count(*) from curation.daily_comments " +
                    "union all select count(*) from curation.rank_placements) x",
            )
            .then((r) => r.rows[0].total as number),
    );
}
