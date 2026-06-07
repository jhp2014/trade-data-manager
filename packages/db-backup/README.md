# @trade-data-manager/db-backup

PostgreSQL 전체 DB를 `pg_dump -Fc` 로 백업하고, **임시 DB에 복구해 검증한 백업만** 정상으로 인정하는 스크립트.

## 왜 이렇게 하나
- `minute_candles` 는 **키움이 1년치만 제공** → 1년 경과분은 DB가 유일본, 영구 대체 불가. 이게 최우선 보호 대상.
- 검증은 "복구 가능한가"만 보증하지 "데이터가 옳은가"는 보증하지 못한다(garbage-in이면 verified-garbage-out). 그래서 시간 간격을 둔 다중 보관 + 불감소 가드로 보강한다.

## 실행
```bash
pnpm --filter @trade-data-manager/db-backup backup
```

## 흐름
1. **변경 감지** — 직전 백업 이후 핵심 테이블 count / `minute_candles.max(id)` 동일하면 스킵.
2. **덤프 생성** — `pg_dump -Fc` → `BACKUP_LOCAL_DIR`.
3. **검증** — 임시 DB(`trade_data_manager_restore_test`) 삭제→생성→`pg_restore`:
   - ① restore 성공
   - ②a 원본 == 복구본 count (전 핵심 테이블)
   - ②b append-only 테이블(daily/minute/feature) 행수 **불감소**
   - ③ 분봉 과거월 raw 집계 지문(count + 시고저종합 + 거래량합 + 거래대금합) **불감소**
     (값/행이 줄면 손상·유실로 간주. 신규 append 는 허용. rate·feature 등 재계산 컬럼은 제외)
   - ④ 덤프 파일 SHA-256 기록 (보관 중 비트로트 추적용)
4. **통과 시** — mybox(`BACKUP_MYBOX_DIR`)로 복사, 양쪽에 보관 정책 적용.
5. **실패 시** — 덤프를 `*.failed.dump` 로 격리, **기존 백업은 절대 삭제 안 함**, `LAST_RUN_FAILED.txt` + 로그에 사유 기록, exit code 1.

## 보관 정책
- 최근 **4개** + 최근 **3개월**(각 월의 최신 1개). 둘 중 하나라도 해당하면 보존.
- **검증 통과한 신규 백업이 보관된 뒤에만** 옛 파일을 삭제한다.
- local / mybox 양쪽에 동일 적용 (물리적으로 독립된 2차 사본).

## 환경변수 (`.env`)
| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | 원본 DB. host/port/user/password 는 임시 DB 접속에도 재사용 |
| `BACKUP_LOCAL_DIR` | 생성·검증·1차 보관 (로컬 디스크) |
| `BACKUP_MYBOX_DIR` | 2차 보관 (MYBOX 동기화 폴더) |
| `PG_BIN_DIR` | `pg_dump`/`pg_restore` 경로 (예: `C:/Program Files/PostgreSQL/17/bin`) |

> `DATABASE_URL` 계정은 임시 DB 생성을 위해 `CREATEDB`(또는 superuser) 권한이 필요하다.

## 상태 파일
- `backup-manifest.json` (local + mybox): 직전 count / minute max(id) / 과거월 지문 / 파일 SHA-256.
  ②③ 비교의 기준점이며 mybox 사본을 정본으로 취급한다.

## 정책 값 (코드 상수, `src/config.ts`)
보관 개수, 임시 DB 이름, 핵심/가드 테이블 목록 등은 머신 비의존이라 코드에 둔다.
