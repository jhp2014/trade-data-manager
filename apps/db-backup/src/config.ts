import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { getDatabaseUrl, getCurationDatabaseUrl } from "@trade-data-manager/persistence/env";

// DB 접속 문자열은 @infra/persistence 메서드(getDatabaseUrl·getCurationDatabaseUrl)로만 취득한다 —
// 앱은 env 변수명·process.env 를 알지 않는다(인프라가 env 로딩까지 자급).
// 백업 도구 고유 설정(보관경로·pg도구·Drive·OAuth)은 아직 루트 .env. (루트 .env 제거 시 apps/db-backup/.env 로 이관)
loadEnv({ path: resolve(process.cwd(), "../../.env") });

function required(name: string): string {
    const v = process.env[name];
    if (!v || v.trim() === "") {
        throw new Error(`환경변수 ${name} 가 설정되지 않았습니다. (.env 확인)`);
    }
    return v.trim();
}

/** 머신마다 다른 값 → .env 에서 주입 */
export const config = {
    /** @infra/persistence 단일 출처(throw if 미설정). */
    databaseUrl: getDatabaseUrl(),
    /** curation 미러 원본(Supabase). null = 별도 DB 아님 → 미러 스킵. */
    curationDatabaseUrl: getCurationDatabaseUrl(),
    /** 덤프 생성·검증 + 로컬 보관 (1차, 빠른 복구용) */
    localDir: required("BACKUP_LOCAL_DIR"),
    /** pg_dump / pg_restore 등 PostgreSQL 클라이언트 도구 경로 */
    pgBinDir: required("PG_BIN_DIR"),
    /**
     * Google Drive 단방향 업로드 (오프사이트 2차).
     * OAuth 자격/토큰은 @trade-data-manager/google/auth 가 env 에서 자급(GOOGLE_OAUTH_* ← GDRIVE_OAUTH_* 폴백).
     * 여기 남는 건 백업 도구 고유 설정인 대상 폴더뿐.
     */
    gdrive: {
        folderId: required("GDRIVE_BACKUP_FOLDER_ID"),
    },
} as const;

/** 백업/검증 정책 상수 (머신 비의존 → 코드에 고정) */
export const policy = {
    /** 검증용 임시 DB 이름 */
    tempDbName: "trade_data_manager_restore_test",
    /** CREATE/DROP DATABASE 를 실행할 유지보수 DB (그 DB 자신엔 접속 불가하므로) */
    maintenanceDb: "postgres",
    /** 보관: 최근 N개 + 최근 M개월 (각 월의 최신 1개) */
    keepRecent: 4,
    keepMonths: 3,
    /**
     * ②b 행수 불감소 가드 대상 (append-only / 대체불가). schema.table 키.
     * 제외: daily_candles(자가치유 overwrite)·daily_market_cap(재계산)·stock_master(덮어쓰기)·
     *       curation.*(사람이 편집·삭제 → 정당한 감소). restore 정합성(②a)은 전 base 테이블을
     *       런타임 열거(inspect.listBaseTables)로 대조하므로 여기 하드코딩하지 않는다.
     */
    guardTables: ["market.daily_candles_raw", "market.minute_candles", "market.stock_news"],
} as const;
