import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// 루트 .env 로드 (다른 패키지와 동일 규약: packages/db-backup → ../../.env)
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
    databaseUrl: required("DATABASE_URL"),
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
    /** restore 정합성 비교 대상 (원본 == 복구본 count) */
    keyTables: [
        "stocks",
        "themes",
        "daily_candles",
        "minute_candles",
        "minute_candle_features",
        "review_target",
        "review_point",
        "review_manual_key",
    ],
    /**
     * 행수 불감소 가드 대상 (append-only / 대체불가).
     * review_* 는 사용자가 합법적으로 삭제할 수 있으므로 제외한다.
     */
    guardTables: ["daily_candles", "minute_candles", "minute_candle_features"],
    /**
     * ③ 분봉 과거월 지문이 대상으로 삼는 raw 컬럼 (키움 원본값, 불변).
     * rate / feature 등 재계산 컬럼은 합법적으로 바뀌므로 제외한다.
     * (실제 합산식은 inspect.ts 의 쿼리에 반영)
     */
    minuteRawColumns: [
        "open_price",
        "high_price",
        "low_price",
        "close_price",
        "trading_volume",
        "trading_amount",
        "accumulated_trading_amount",
    ],
} as const;
