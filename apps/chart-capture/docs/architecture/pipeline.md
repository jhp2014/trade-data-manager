> 이 문서가 답하려는 질문: CSV 파일 하나가 들어왔을 때 PNG가 나오기까지 어떤 과정을 거치는가?

# 캡처 파이프라인 전체 흐름

---

## 개요

`cli/index.ts` → CSV 파싱 → Next 서버 기동(또는 외부 서버 검증) → Playwright launch → 각 job 처리(페이지 이동·라인 주입·스크린샷) → CSV 이동 → 종료.

---

## 상세 흐름

1. **CLI 옵션 파싱** (`src/cli/index.ts`)
   - commander로 `--file`, `--dry-run`, `--external-server` 등 옵션을 파싱한다.
   - `loadConfig()`로 `capture.config.ts` 설정을 로드하고, CLI 옵션으로 override를 적용한다.
   - `runCapture(config, options)`를 호출하고, 완료 후 `endCaptureDb()`로 DB 풀을 정리한다.

2. **디렉터리 보장 + CSV 목록 수집** (`src/pipeline/runCapture.ts`)
   - inputDir, outputDir, processedSubdir, failedSubdir가 없으면 생성한다.
   - `listCsvFiles(inputDir)`로 `.csv` 파일 목록을 가져온다.
   - `--file` 옵션(`onlyFile`)이 있으면 해당 파일명만 남긴다.

3. **DB 풀 확보** (`src/data/db.ts`)
   - `getCaptureDb()`로 singleton DB 풀을 반환한다. CLI 종료 시점에 `endCaptureDb()`가 풀을 닫는다.

4. **Next 서버 기동 또는 외부 서버 검증** (`src/pipeline/nextServer.ts`)
   - `config.externalServerUrl`이 있으면 `verifyExternalServer(url)`로 헬스 체크만 수행한다.
   - 없으면 `startNextServer({ port, dev, startTimeoutMs, appDir })`로 `next start`(또는 `next dev`) 프로세스를 spawn하고 `NextServerHandle`을 받는다.

5. **Playwright driver 생성** (`src/pipeline/playwrightDriver.ts`)
   - `createPlaywrightDriver(config, baseUrl)`로 `PlaywrightDriver`를 생성한다.
   - `concurrency === 1`: 단일 Context + 단일 Page를 재사용.
   - `concurrency > 1`: 단일 Context, job마다 새 Page를 열고 완료 후 닫는다.

6. **CSV 파일별 처리** (`src/pipeline/runCapture.ts`)
   - `parseCsvFile(csvPath, config)`로 `CaptureCsvRow[]`와 파싱 에러 목록을 반환받는다.
   - 파싱이 전체 실패하면 `.error.log` 동봉 후 `failedSubdir`로 이동.
   - `findStocksMapByCodes(db, { stockCodes })`로 종목 정보를 일괄 조회한다.
   - row × variant 조합으로 `CaptureJob[]`을 생성한다. `isNxtAvailable === false`인 종목의 NXT variant는 `partialLog`에 기록하고 skip.

7. **job 실행** (`src/pipeline/playwrightDriver.ts`)
   - `runWithConcurrency(jobs, config.concurrency, fn)`로 job을 병렬 실행한다.
   - 각 job에서: `page.goto` → pre-ready / empty 마커 race → empty면 skip → `page.evaluate`로 라인 주입 → `__CHART_READY__` 대기 → `#capture-root` 스크린샷.
   - 자세한 흐름: [capture-page.md](./capture-page.md)

8. **결과 집계 + CSV 이동**
   - success / skipped / failed 카운트를 누적한다.
   - skip / failed job은 `partialLog`에 이유를 기록한다.
   - `partialLog`가 비어있지 않으면 `.partial.log` 동봉 후 `processedSubdir`로 이동.

9. **종료 + 요약 출력**
   - `driver.close()` → `stopServer()` → DB 풀 정리.
   - elapsed time, 파일 수, job 수, success/skipped/failed를 로그로 출력.
   - 실패가 있으면 non-zero exit code를 반환한다.

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|------------|
| `src/cli/index.ts` | CLI 진입점, 옵션 파싱 | — |
| `src/pipeline/runCapture.ts` | 전체 파이프라인 오케스트레이션 | `runCapture`, `RunSummary` |
| `src/pipeline/csvIO.ts` | CSV 파싱, 파일 이동, sidecar log 생성 | `parseCsvFile`, `moveCsvFile`, `buildSidecarLog` |
| `src/pipeline/nextServer.ts` | Next 서버 spawn / 헬스 체크 | `startNextServer`, `verifyExternalServer` |
| `src/pipeline/playwrightDriver.ts` | Playwright 브라우저 제어, 스크린샷 | `createPlaywrightDriver`, `runWithConcurrency` |
| `src/data/db.ts` | DB 풀 singleton | `getCaptureDb`, `endCaptureDb` |
| `src/data/fetchChartData.ts` | DB에서 일봉·분봉 조회 | `fetchChartData` |
| `src/types/capture.ts` | 캡처 도메인 타입 | `CaptureJob`, `CaptureCsvRow`, `LineSpec` |
| `capture.config.ts` | 런타임 설정 스키마 및 기본값 | `loadConfig`, `CaptureConfig` |

---

## 설계 결정

- 별도 앱으로 분리 → [ADR-001](../decisions/001-separate-from-data-view.md)
- NXT 미지원 종목 skip → [ADR-003](../decisions/003-nxt-skip-not-fallback.md)
- page.evaluate로 라인 주입 → [ADR-002](../decisions/002-page-evaluate-line-injection.md)

---

## 확장 포인트

- **새 variant 추가**: `capture.config.ts`의 `variants` 배열에 추가하고, `page.tsx`와 차트 컴포넌트의 `variant` 타입 리터럴을 확장한다.
- **새 `line_` column 색상 추가**: `csvIO.ts`의 색상 매핑 테이블을 수정한다.
- **CSV 스키마 변경**: `csvIO.ts`의 `parseCsvFile`을 수정하고, `CaptureCsvRow` 타입을 갱신한다. 캡처 페이지 props(`page.tsx`)도 함께 수정해야 한다.
- **concurrency 조정**: `capture.config.ts`의 `concurrency` 기본값을 변경하거나 CLI `--concurrency` 옵션을 추가한다.
