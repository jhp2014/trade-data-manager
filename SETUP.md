# SETUP — 새 PC에 설치하기

`git clone` / `git pull` 만으로는 동작하지 않는다. `.env`(6개)와 로컬 PostgreSQL 시딩이 별도로 필요하다.
이 문서는 새 머신에서 처음부터 세팅하는 순서를 정리한다.

> 아키텍처: pnpm workspace 모노레포(Turborepo) + 헥사고날(`apps` / `core` / `contracts` / `infra`).
> 현행 앱은 `apps/api`(NestJS REST) · `apps/workbench`(Vite/React SPA) · `apps/ingest`(수집 CLI) · `apps/db-ops`(DB 백업/복원 CLI).

---

## 1. 사전 요구사항 (버전)

| 항목 | 버전 | 비고 |
|------|------|------|
| **Node.js** | **22 LTS 권장** (20+ 가능) | 핀 파일 없음. `@types/node`가 22~25, tsx·Vite 사용 |
| **pnpm** | **10.5.2 (고정)** | `package.json`의 `packageManager`가 강제. Corepack으로 자동 정렬 |
| **PostgreSQL** | **17 권장** | 로컬 `market` DB용. `pg_dump`/`pg_restore` 클라이언트 도구 포함 설치 |
| TypeScript | 6.0.3 | 루트 devDependency (전 워크스페이스 공용) |
| Turborepo | 2.x | 모노레포 태스크 러너 |

Node·pnpm 준비:

```bash
corepack enable          # package.json의 pnpm@10.5.2 를 자동 사용
node -v                  # v22.x 확인
```

---

## 2. 의존성 설치

```bash
# 저장소 루트에서
pnpm install             # 워크스페이스 전체 설치

# 타입 검사로 설치 정상 여부 확인 (선택)
pnpm type-check
```

> 캐시/빌드 문제 시: `pnpm clean` → `pnpm clean:cache` → `pnpm fresh`(clean:all + install + build) 순으로 단계적 청소.

---

## 3. 환경변수 `.env` (6개 — 전부 gitignore, 새로 작성)

`.env`는 커밋되지 않는다. 각 패키지가 **자급식**으로 자기 `.env`를 로드하므로, 아래 6곳에서 `.env.example`을 `.env`로 복사한 뒤 값을 채운다. (필요한 패키지만 채우면 된다 — 예: 텔레그램 뉴스를 안 쓰면 `infra/telegram`은 생략 가능.)

| 파일 | 필수 여부 | 채울 값 |
|------|-----------|---------|
| `infra/persistence/.env` | **필수** | `DATABASE_URL`(로컬 market), `CURATION_DATABASE_URL`(공유 Supabase) |
| `apps/db-ops/.env` | DB 백업/복원 시 | `BACKUP_LOCAL_DIR`, `PG_BIN_DIR`(PostgreSQL 17 bin), `GDRIVE_BACKUP_FOLDER_ID` |
| `infra/google/.env` | Drive/Sheets 사용 시 | `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` (+ refresh token은 §6 login으로) |
| `infra/kiwoom/.env` | 키움 수집 시 | `KIWOOM_APP_KEY` / `_SECRET_KEY` |
| `infra/kis/.env` | KIS 수집 시 | `KIS_APP_KEY` / `_APP_SECRET` |
| `infra/telegram/.env` | 텔레그램 뉴스 시 | `TELEGRAM_API_ID` / `_API_HASH` / `_PHONE` (+ session은 §6 login으로) |

복사 예:

```bash
cp infra/persistence/.env.example infra/persistence/.env
cp apps/db-ops/.env.example       apps/db-ops/.env
cp infra/google/.env.example      infra/google/.env
cp infra/kiwoom/.env.example      infra/kiwoom/.env
cp infra/kis/.env.example         infra/kis/.env
cp infra/telegram/.env.example    infra/telegram/.env
```

각 `.env.example` 상단에 항목별 설명이 있으니 반드시 읽고 채운다.

---

## 4. 데이터베이스 (제일 주의)

DB는 **협업 배포 분리** 설계로 두 스트림이 물리적으로 나뉜다:

- **`market` 스키마 = 각자 로컬 PostgreSQL** → 새 PC마다 설치·시딩 필요 (대용량, 파티션 포함)
- **`curation` 스키마 = 공유 Supabase** → **로컬에 만들지 않음**. 접속 문자열만 있으면 됨 (쓰기 단일 소스)

### 4-1. 로컬 PostgreSQL 준비

- PostgreSQL **17** 설치. 접속 계정에 **CREATEDB 권한** 필요(프로비저닝 시 `CREATE DATABASE` 수행).
- 기본 로컬 DB 이름은 `trade-data-manager` (`infra/persistence/.env`의 `DATABASE_URL` 기준).
- `apps/db-ops/.env`의 `PG_BIN_DIR`가 `pg_dump`/`pg_restore` 경로를 가리켜야 한다 (예: `C:/Program Files/PostgreSQL/17/bin`).
- 복원은 **덤프를 만든 서버 메이저 버전 ≥ pg_restore 버전**이어야 안전 → 덤프 생성 머신과 같은 17로 맞추는 게 최선.

### 4-2. market 시딩 (마이그레이션이 아니라 덤프 복원)

로컬 market은 파티션·손SQL 때문에 마이그레이션으로 처음부터 만들지 않고 **다른 머신의 `pg_dump` 덤프로 복원**한다. `db-ops setup`이 DB 생성 + 복원을 한 번에 처리한다.

```bash
# Drive의 최신 백업에서 DB 생성 + market 복원.  --yes 없으면 dry-run(아무것도 안 함)
pnpm --filter @trade-data-manager/db-ops exec tsx src/index.ts setup --from-drive --yes

# 로컬 덤프 파일이 이미 있으면 파일 경로 지정도 가능
# pnpm --filter @trade-data-manager/db-ops exec tsx src/index.ts setup <dump-file> --yes
```

`setup`은 curation을 로컬에 만들지 않고, Supabase 접속만 확인한다.

### 4-3. curation (Supabase) 접속 함정 ⚠️

`CURATION_DATABASE_URL`을 만들 때 두 가지를 반드시 지킨다 (안 지키면 로컬에서 접속 실패):

1. **Direct 호스트(`db.<ref>.supabase.co`) 쓰지 말 것** — IPv6 전용이라 `ENOTFOUND`. Supabase 대시보드 **Connect → Session pooler** 문자열 사용 (`aws-…pooler.supabase.com:5432`, user=`postgres.<ref>`).
2. **`?sslmode=no-verify` 붙일 것** — node-pg가 `sslmode=require`를 verify-full로 취급해 Supabase 인증서를 거부한다.

```
CURATION_DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:5432/postgres?sslmode=no-verify
```

> curation 스키마 자체는 이미 Supabase에 마이그레이션되어 있으므로(공유), 보통 새 PC에서 curation 마이그레이션을 돌릴 일은 없다.

---

## 5. 머신별 대화형 인증 (복사만으론 안 됨)

토큰/세션은 브라우저·전화 인증이 필요해 머신마다 1회 발급한다.

```bash
# Google OAuth refresh token — 브라우저 1회 동의 (Drive+Sheets 통합 스코프)
pnpm --filter @trade-data-manager/google login
#  → 발급된 refresh token을 infra/google/.env 의 GOOGLE_OAUTH_REFRESH_TOKEN 에 기록

# Telegram 세션 — recon:login 1회 실행 → 콘솔의 세션 문자열을
#  infra/telegram/.env 의 TELEGRAM_SESSION 에 붙여넣기
#  (이 문자열은 계정 풀권한이므로 절대 커밋/공유 금지)
```

---

## 6. 앱 실행

| 앱 | 명령 | 포트 |
|----|------|------|
| **api** (NestJS REST) | `pnpm --filter @trade-data-manager/api dev` | 3001 (`API_PORT`로 변경) |
| **workbench** (Vite SPA) | `pnpm --filter @trade-data-manager/workbench dev` | 3100 (`/api` → :3001 프록시) |
| **ingest** (수집 CLI) | `pnpm --filter @trade-data-manager/ingest start <cmd>` | — |
| **db-ops** (백업/복원 CLI) | `pnpm --filter @trade-data-manager/db-ops backup` 등 | — |

워크벤치는 개발 시 `/api` 요청을 `:3001`의 api로 프록시하므로 **api를 먼저 띄운다**.

---

## 7. 요약 체크리스트

```
1. corepack enable  &&  pnpm install
2. PostgreSQL 17 설치 (+ CREATEDB 권한)
3. .env 6개 작성  (Supabase는 Session pooler + ?sslmode=no-verify)
4. db-ops setup --from-drive --yes   → 로컬 market 시딩
5. google login / telegram login     → 머신별 토큰·세션 1회 발급
6. api dev  → workbench dev           → 동작 확인
```
