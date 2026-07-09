# @trade-data-manager/google

두 프로젝트(trade-data-manager · market-eye)가 제각각 쓰던 **Google 접근을 한 곳으로 모은 공통 패키지**. 본인 Google 계정 OAuth 하나로 인증을 통일하고, 소비자는 설정을 몰라도 `createOAuthClient()` / `createSheetsClient()` 한 줄로 쓴다.

```
@trade-data-manager/google
  ├── /auth           OAuth 인증 (refresh token → 인증된 클라이언트). sheets·drive 공용.
  ├── /sheets         Sheets 읽기/쓰기 (googleapis 위 얇은 래퍼, Layer 1: IO)
  ├── /sheets/matrix  순수 매트릭스 헬퍼 (Layer 2: googleapis 무의존)
  └── /drive          Drive 파일 생성/목록/삭제/upsert (googleapis 위 얇은 래퍼, Layer 1: IO)
```

설계 경계: **패키지는 도메인을 모른다.** transport 는 `string[][]` 만 주고받고, "어느 시트/탭" · 헤더 별칭표 · 도메인 매핑(ReviewRow/ThemeMember 등)은 **소비자 몫**.

---

## 설정 (최초 1회)

이 패키지는 자기 `.env` 를 자급한다(kiwoom 와 동일 규약). 소비 앱은 Google 설정을 안 가져도 된다.

```bash
# 1) 계약 파일 복사 후 client id/secret 기입
cp packages/google/.env.example packages/google/.env

# 2) 브라우저 1회 동의로 refresh token 발급 (통합 스코프 drive.file + spreadsheets)
pnpm --filter @trade-data-manager/google login
```

`packages/google/.env` (gitignore, 계약 3줄):

| 변수 | 설명 |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | GCP 콘솔 OAuth 클라이언트(Desktop) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 〃 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | `login` 이 자동 기록 (직접 채우지 않음) |

- 기존 루트 `.env` 의 `GDRIVE_OAUTH_*` 도 `process.env` 에 있으면 **폴백**으로 읽힌다(전환기 브리지).
- **클라우드**: 런타임은 토큰을 **읽기만** 한다(`save` 는 `login` 전용). 플랫폼이 주입한 env 가 파일보다 우선하므로, 읽기전용 컨테이너에서도 안 깨진다.

---

## /auth

```ts
import { createOAuthClient } from "@trade-data-manager/google/auth";
import { google } from "googleapis";

// refresh token 이 세팅된 OAuth2Client. googleapis 어디든 주입 가능.
const auth = createOAuthClient();
const drive = google.drive({ version: "v3", auth });
```

`createOAuthClient(opts?)` — 인자 생략 시 env 에서 자급. 테스트/멀티계정용으로 `clientId`·`clientSecret`·`refreshToken`·`tokenStore` 주입 가능.

기타 export: `runOAuthLogin`, `GOOGLE_OAUTH_SCOPES`, `loadGoogleOAuthConfig`, `createEnvRefreshTokenStore`, `ensureGoogleEnvLoaded`.

---

## /sheets (Layer 1 — 읽기/쓰기)

```ts
import { createSheetsClient } from "@trade-data-manager/google/sheets";

const sheets = createSheetsClient(); // auth 자급. 인스턴스 1개 만들어 재사용 권장.

// 읽기 — 탭 전체를 원본 매트릭스로
const matrix = await sheets.readMatrix(spreadsheetId, "review");
// 범위/렌더 옵션
await sheets.readMatrix(spreadsheetId, "review", { range: "A:D", valueRender: "UNFORMATTED_VALUE" });

// 탭 목록
const tabs = await sheets.listTabs(spreadsheetId);

// 덮어쓰기 (clear 후 A1부터, 탭 없으면 생성)
await sheets.overwriteTab({ spreadsheetId, tab: "export", matrix });

// 행 추가 (빈 탭이면 헤더 자동 초기화, 2회차부턴 append 1회)
const { wroteHeaders } = await sheets.appendRows({
  spreadsheetId,
  tab: "log",
  headers: ["code", "date"],
  rows: [["005930", "2026-06-26"]],
});
```

특징:
- **`valueInputOption` 기본 `"RAW"`** — 리터럴 보존(종목코드 앞 0·날짜 문자열·수식 오인 방지). `"USER_ENTERED"` 로 오버라이드 가능.
- **인스턴스 캐시** — 탭 존재/공백 확인 왕복을 2회차부터 생략(캐시는 인스턴스 단위라 소비자끼리 안 섞임).
- **자가복구** — 외부에서 탭이 삭제돼 append 가 실패하면 캐시를 비우고 탭 재생성→헤더→append 로 복구.
- 에러는 `SheetsError`(meta 에 `op`/`status`/`range`). 탭 부재 판단은 `isMissingTabError`.

### 테스트 (transport 주입)

googleapis 호출은 `transport.ts` 한 곳에만 갇혀 있다. 네트워크 없이 로직만 검증하려면 fake 를 주입한다.

```ts
import { makeSheetsClient } from "@trade-data-manager/google/sheets";
const client = makeSheetsClient(fakeTransport); // SheetsTransport 구현
```

---

## /sheets/matrix (Layer 2 — 순수 헬퍼)

googleapis 를 import 하지 않는다 → 클라이언트 컴포넌트/테스트에서 안전. 별칭 맵(키→허용 헤더명)을 인자로 받아 매트릭스 ↔ 객체를 변환한다(**컬럼 순서 무관**).

```ts
import { matrixToObjects, objectsToMatrix } from "@trade-data-manager/google/sheets/matrix";

const rows = await sheets.readMatrix(id, "members"); // string[][]
const objs = matrixToObjects(rows, {
  theme: ["테마", "theme"],
  code:  ["종목코드", "코드", "code"],
});
// → [{ theme: "AI", code: "000660" }, ...]   (데이터 행 하나 → 객체 하나, 빈 행 skip)

// 쓰기용 역변환
const matrix = objectsToMatrix(objs, [
  { key: "theme", header: "테마" },
  { key: "code",  header: "종목코드" },
]);
```

- `headerIndexMap(header, aliases)` — 헤더명으로 컬럼 인덱스(trim/대소문자 무시). 매칭 없는 키는 빠짐.
- **도메인은 소비자에**: 별칭표·필수컬럼 검증·`toCanonical` 같은 정규화·타입 부여(ReviewRow/ThemeMember)는 호출부에서 한다.

---

## /drive (Layer 1 — 파일 IO)

```ts
import { createDriveClient } from "@trade-data-manager/google/drive";
import fs from "node:fs";

const drive = createDriveClient(); // auth 자급. 인스턴스 1개 만들어 재사용 권장.

// 폴더에 새 파일 업로드 — id/md5/size 반환(무결성 대조용)
const { id, md5Checksum } = await drive.uploadFile({
  folderId,
  name: "2026-07-09.dump",
  body: fs.createReadStream(localPath),
});

// 폴더 내 (앱이 만든) 파일 목록 — 페이지네이션 자동
const files = await drive.listFiles(folderId);

await drive.deleteFile(id);

// 같은 이름이면 내용 갱신, 없으면 생성. 동명 중복은 정리(manifest 용).
await drive.uploadOrUpdate({ folderId, name: "manifest.json", body: fs.createReadStream(p) });
```

특징:
- **drive.file 스코프** — 앱이 만든 파일만 접근 → 목록/삭제가 우리 파일에만 작용해 안전.
- **패키지는 도메인을 모른다** — 대상 폴더(`folderId`)·로컬 파일경로는 소비자가 인자로 넘긴다(body 는 `Readable` 스트림). "어느 폴더/어떤 이름"·무결성 대조는 소비자 몫.
- **공유 드라이브 지원**(`supportsAllDrives`).
- 에러는 `DriveError`(meta 에 `op`/`status`).

### 테스트 (transport 주입)

googleapis 호출은 `transport.ts` 한 곳에만 갇혀 있다. fake 를 주입해 upsert/dedup 을 네트워크 없이 검증한다.

```ts
import { makeDriveClient } from "@trade-data-manager/google/drive";
const client = makeDriveClient(fakeTransport); // DriveTransport 구현
```

---

## 스크립트

| 명령 | 설명 |
|---|---|
| `pnpm --filter @trade-data-manager/google login` | OAuth 로그인 → refresh token 발급(통합 스코프) |
| `pnpm --filter @trade-data-manager/google recon:auth` | 인증 스모크(access token 발급 + 부여 스코프 점검) |
| `pnpm --filter @trade-data-manager/google recon:sheets` | 시트 read 스모크(루트 `.env` 의 `GOOGLE_SHEETS_ID` 필요, 읽기 전용) |
| `pnpm --filter @trade-data-manager/google test` | 단위 테스트(순수 헬퍼 + fake transport) |
| `pnpm --filter @trade-data-manager/google type-check` | 타입 체크 |

---

## 소비자 (현재 / 예정)

- **db-backup(app)**: `createDriveClient()` 로 백업/manifest 를 Drive 에 단방향 업로드. folderId·로컬파일 바인딩은 앱의 `gdrive.ts` 도메인 글루(패키지는 몰라도 됨). 이전 googleapis 직접 사용분을 `/drive` 로 흡수.
- **워크벤치(예정)**: greenfield 로 만들 때 `createSheetsClient()` 로 복기 시트 R/W 배선. 현 chart-review/hypothesis-lab 의 시트 코드는 그때 대체.
- **market-eye(2단계)**: 모노레포 흡수 시 `sheetsThemeSource` 가 이 패키지로 수렴(헤더 별칭 → `/sheets/matrix`). 절대위치 쓰기가 필요하면 그때 `setRowsAt` 추가.
