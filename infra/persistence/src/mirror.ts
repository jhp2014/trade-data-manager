import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDatabaseUrl, getCurationDatabaseUrl } from "./env.js";
import { parseConnFromUrl, runPgToolOn, withPgClient, type PgConn } from "./pgTool.js";

/**
 * curation 미러 — 단방향 전체교체(Supabase → 로컬).
 *   pg_dump -Fc -n curation (Supabase) → curation 을 curation_prev 로 밀어두고 → pg_restore (로컬).
 *
 * **단계식 교체(staged replace)**: 옛 DROP CASCADE → restore 는 restore 가 중간에 죽으면 로컬이
 * "스키마 없음/반쪽" 상태로 남았다(다음 동기화까지 모든 curation 읽기가 깨진다). RENAME 으로 밀어두면
 * 실패 시 부분 생성분만 지우고 되돌려, 미러가 최악이라도 직전 상태로 남는다.
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

/** select 만 할 수 있으면 된다 — pg Pool/Client 둘 다 구조적으로 만족(api 는 상주 풀을 재사용). */
export interface MirrorStateQuerier {
    query(text: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * 로컬 미러의 마지막 동기화 시각. 한 번도 안 돌았으면 null.
 * 폴링(GET /curation/sync, 분당)이 부르므로 **가볍다**: 주입된 커넥션/풀을 재사용하고 DDL 을 안 돌린다 —
 * 표 생성은 쓰기 경로(replaceLocalSchema)만 한다. 표가 아직 없으면(첫 동기화 전) null 로 합류.
 */
export async function readLastMirrorSyncAt(q: MirrorStateQuerier): Promise<Date | null> {
    try {
        const r = await q.query(`select synced_at from ${STATE_TABLE} where name = '${STATE_KEY}'`);
        return r.rows.length > 0 ? (r.rows[0].synced_at as Date) : null;
    } catch (e) {
        if ((e as { code?: string }).code === "42P01") return null; // undefined_table — 아직 한 번도 안 돎
        throw e;
    }
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
    // 실행마다 고유한 파일명 — 두 프로세스(api 버튼·야간 db-ops)가 겹쳐도 서로의 덤프를 밟지 않는다.
    const tmp = path.join(workDir, `_curation_mirror.${process.pid}.${Date.now()}.dump`);

    try {
        // 1. Supabase 의 curation 스키마 덤프(스키마+데이터, custom 포맷).
        //    깨지기 쉬운 네트워크 단계를 스키마 교체보다 먼저 둔다 — 실패해도 로컬은 손대지 않은 상태로 남는다.
        //    SSL: pg_dump 는 libpq 라 PGSSLMODE=require(암호화·인증서검증 생략)로 Supabase pooler 호환.
        await runPgToolOn(opts.pgBinDir, "pg_dump", src, ["-Fc", "-n", "curation", "--no-owner", "--no-privileges", "-f", tmp], {
            PGSSLMODE: "require",
        });
        const syncedAt = await replaceLocalSchema(local, tmp, opts.pgBinDir);
        const rows = await countMainTables(local);
        log(`curation 미러 완료: Supabase→로컬 (주요 4테이블 ${rows}행)`);
        return { syncedAt, rows, skipped: false };
    } finally {
        if (fs.existsSync(tmp)) fs.rmSync(tmp);
    }
}

/** 로컬에 schema 가 존재하나. RENAME/복구 분기의 근거 — 첫 동기화(스키마 없음)와 재동기화를 가른다. */
async function schemaExists(c: { query: (q: string) => Promise<{ rows: unknown[] }> }, name: string): Promise<boolean> {
    const r = await c.query(`select 1 from information_schema.schemata where schema_name = '${name}'`);
    return r.rows.length > 0;
}

async function replaceLocalSchema(local: PgConn, dumpPath: string, pgBinDir: string): Promise<Date> {
    // 2. 단계식 교체 — 현행 curation 을 지우지 않고 curation_prev 로 밀어둔다(복원 실패 시 되돌릴 백업).
    //    prev 폐기는 **curation 이 있을 때만** 한다: rename~restore 사이에 프로세스가 죽으면(전원·킬)
    //    curation_prev 가 유일한 로컬 사본인데, 무조건 지우면 이번 restore 까지 실패하는 이중 장애에서
    //    사본이 전멸한다. curation 부재 + prev 존재 = 직전 크래시의 생존 사본 → 그대로 두면 아래
    //    실패 catch 의 prev→curation rename 이 복구를 담당한다.
    await withPgClient(local, async (c) => {
        if (await schemaExists(c, "curation")) {
            await c.query("DROP SCHEMA IF EXISTS curation_prev CASCADE");
            await c.query("ALTER SCHEMA curation RENAME TO curation_prev");
        }
    });
    try {
        // pg_restore 에 -n 필터를 주지 않는다: 덤프가 이미 curation 전용이고, -n 을 주면 CREATE SCHEMA
        // 엔트리가 "curation 소속"이 아니라 걸러져 스키마가 안 생기고 CREATE TABLE 이 전부 실패한다.
        await runPgToolOn(pgBinDir, "pg_restore", local, ["--no-owner", "--no-privileges", dumpPath]);
    } catch (e) {
        // 3-실패. 부분 생성된 curation 을 지우고 밀어둔 스키마를 되살린다 — 미러가 반쪽으로 남지 않는다.
        //    (복구 자체가 실패하면 curation_prev 가 생존 사본으로 남고, 다음 실행이 보존했다가 여기서 되살린다.)
        await withPgClient(local, async (c) => {
            await c.query("DROP SCHEMA IF EXISTS curation CASCADE");
            if (await schemaExists(c, "curation_prev")) await c.query("ALTER SCHEMA curation_prev RENAME TO curation");
        });
        throw e;
    }

    // 3-성공. 백업 폐기 + 동기화 시각 기록(표 생성은 이 쓰기 경로만 한다 — 읽기는 DDL 무비용).
    return withPgClient(local, async (c) => {
        await c.query("DROP SCHEMA IF EXISTS curation_prev CASCADE");
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
                    "union all select count(*) from curation.daily_comments) x",
            )
            .then((r) => r.rows[0].total as number),
    );
}
