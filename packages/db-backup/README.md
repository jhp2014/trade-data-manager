# @trade-data-manager/db-backup

PostgreSQL 전체 DB를 `pg_dump -Fc` 로 백업하고, **임시 DB에 복구해 검증한 백업만** 정상으로 인정한 뒤,
**로컬(1차) + Google Drive(오프사이트 2차)** 로 단방향 보관하는 스크립트.

## 왜 이렇게 하나
- `minute_candles` 는 **키움이 1년치만 제공** → 1년 경과분은 DB가 유일본, 영구 대체 불가. 최우선 보호 대상.
- 검증은 "복구 가능한가"만 보증하지 "데이터가 옳은가"는 보증하지 못한다(garbage-in이면 verified-garbage-out). 그래서 시간 간격을 둔 다중 보관 + 불감소 가드로 보강한다.
- 동기화 폴더(MYBOX 등)는 로컬과 **양방향 동기화**라 손상/삭제가 그대로 전파된다 → 독립 사본이 아님.
  그래서 **Google Drive API 로 단방향 업로드**(내려받아 덮지 않음)해 진짜 오프사이트 사본을 만든다.

## 실행
```bash
# 백업 (스케줄러도 이 명령을 호출)
pnpm --filter @trade-data-manager/db-backup backup

# 최초 1회: Google OAuth 로그인 (refresh token 발급 → .env 자동 기록)
# 인증은 @trade-data-manager/google/auth 로 통합됨(본인 계정, Drive+Sheets 공용 토큰)
pnpm --filter @trade-data-manager/google login
```

## 흐름
1. **변경 감지** — 직전 백업 이후 핵심 테이블 count / `minute_candles.max(id)` 동일하면 새 덤프 생략.
2. **덤프 생성** — `pg_dump -Fc` → `BACKUP_LOCAL_DIR`.
3. **검증** — 임시 DB(`trade_data_manager_restore_test`) 삭제→생성→`pg_restore`:
   - ① restore 성공
   - ②a 원본 == 복구본 count (전 핵심 테이블)
   - ②b append-only 테이블(daily/minute/feature) 행수 **불감소**
   - ③ 분봉 과거월 raw 집계 지문(count + 시고저종합 + 거래량합 + 거래대금합) **불감소**
     (값/행이 줄면 손상·유실로 간주. 신규 append 는 허용. rate·feature 등 재계산 컬럼은 제외)
   - ④ 덤프 파일 SHA-256 기록
4. **로컬 확정** — 검증 통과 시 로컬 보관정책 적용 + manifest 갱신.
5. **Drive 동기화(reconcile)** — *매 실행마다* 수행(직전 업로드 실패도 자동 재시도):
   - 로컬에 있고 Drive에 없는 덤프 업로드 → **Drive md5 와 로컬 md5 대조**로 전송 무결성 확인
   - Drive 보관정책 적용
   - manifest 업로드(오프사이트에도 SHA-256/지문 보존)
6. **실패 시** — 검증 전 덤프는 `*.failed.dump` 로 격리, **확정된 기존 백업은 절대 삭제 안 함**,
   `LAST_RUN_FAILED.txt` + 로그에 사유 기록, exit code 1.

## 보관 정책
- 최근 **4개** + 최근 **3개월**(각 월의 최신 1개). 둘 중 하나라도 해당하면 보존.
- **검증 통과/확정 후에만** 옛 파일 삭제.
- 로컬 / Drive 양쪽에 동일 적용 (물리적으로 독립된 2차 사본).

## 환경변수 (`.env`)
| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | 원본 DB. host/port/user/password 는 임시 DB 접속에도 재사용 |
| `BACKUP_LOCAL_DIR` | 생성·검증·로컬 1차 보관 |
| `PG_BIN_DIR` | `pg_dump`/`pg_restore` 경로 (예: `C:/Program Files/PostgreSQL/17/bin`) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | GCP OAuth(Desktop) 클라이언트 (기존 `GDRIVE_OAUTH_*` 폴백) |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | `pnpm --filter @trade-data-manager/google login` 이 자동 기록 |
| `GDRIVE_BACKUP_FOLDER_ID` | 업로드 대상 Drive 폴더 ID |

> - `DATABASE_URL` 계정은 임시 DB 생성을 위해 `CREATEDB`(또는 superuser) 권한이 필요하다.
> - Drive 업로드는 **OAuth(사용자 본인)** 로 동작한다. 서비스 계정은 개인 Drive에 저장 할당량이 없어 업로드가 불가(`storageQuotaExceeded`)하다.
> - 스코프는 `drive.file`(앱이 만든 파일만 접근) — 최소 권한이며 Google 앱 검수 불필요.
>   단, OAuth consent 화면을 **"In production"** 으로 게시해야 refresh token 이 만료되지 않는다(Testing 은 7일).

## 상태 파일
- `backup-manifest.json` — 로컬을 정본으로 두고 Drive 에도 업로드.
  직전 count / minute max(id) / 과거월 지문 / 파일 SHA-256 을 담아 ②③④ 비교의 기준점이 된다.

## 정책 값 (코드 상수, `src/config.ts`)
보관 개수, 임시 DB 이름, 핵심/가드 테이블 목록 등 머신 비의존 값은 코드에 둔다.
