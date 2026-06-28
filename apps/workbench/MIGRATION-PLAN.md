# Workbench 마이그레이션 계획 (기존 자산 → 새 앱)

> 이 문서는 **콜드 인수인계용**이다. 다른 세션이 이 대화 맥락 없이 이 파일만 읽고 시작할 수 있게 썼다.
> 전체 설계 배경은 메모리 `hts-consolidation-design.md` 참조(이 repo 밖, Claude 메모리). 코드 작업은 이 계획 확정 후 진행.

## 핵심 원칙 (한 줄)
**greenfield the shell · migrate the core · reuse the DB** — 앱 쉘/UI는 새로 짜고, 도메인 코드는 이주(거의 복붙+테스트 동반), DB 스키마는 그대로 재사용.

두 모드를 절대 섞지 말 것:
- **도메인 패키지(data-core·키움·시트·차트·calculator)** = 이주. 로직 손대지 말고 import 경로만 수정. 테스트 같이 가져와 "안 깨졌나" 검증.
- **앱 쉘(라우팅·컨테이너·server action·UI)** = 새로. 기존 코드는 *참고만*. 980줄 ReviewWorkspace나 혼재된 route를 복붙해 패치하지 말 것(그러면 "지저분"이 따라옴).

---

## 0. 시작 전 필수 — decision 문서부터 읽기 (이미 푼 문제의 WHY)
새로 짜다가 같은 함정을 버그로 재발견하지 않도록 먼저 읽는다:
- `apps/chart-review/docs/decisions/*` (특히 002 sheet→DB SSOT, 003 read-sheet bookmark, 004 unified-stock-bundle-query, 005 active-target, 006 tab-management)
- `apps/chart-review/docs/architecture.md`, `code-map.md`
- `apps/chart-capture/docs/decisions/*` (002 page-evaluate line injection, 003 NXT skip, 004 daily-no-line-label, 005 high-rate-marker)
- `apps/chart-review/docs/decisions/004-unified-stock-bundle-query.md` = 번들 쿼리 설계(절반 구현). 워크벤치 데이터 로딩의 핵심.

---

## 1. 타깃 구조 (모노레포)
```
apps/
  workbench/          ★신규 — Next + 도킹 패널(dockview). review+hypothesis 통합 + 파이프라인 트리거
  chart-review/       패리티까지 병행 후 제거
  hypothesis-lab/     패리티까지 병행 후 제거
  chart-capture/      당분간 유지(Playwright 잡). 나중 pipeline 쪽으로 흡수 검토
  batch/              → packages/pipeline 로 흡수 후 제거
  feature-processor/  → packages/pipeline 로 흡수 후 제거
packages/
  data-core/          유지(그대로 import). 모든 DB 쿼리·스키마·calculator의 단일 출처
  pipeline/           ★신규 — batch+feature 흡수. 스테이지: ingest→assemble→feature→classify
  kiwoom/        ★신규 — 키움 REST/WS/token 클라이언트 추출
  sheet-core/         ★신규 — Google Sheets 읽기/쓰기 추출(헤더 별칭 파싱 포함)
  (theme-core/        2단계: market-eye 흡수 시 buildBoard 등)
  (chart-core/        2단계: lightweight-charts 셸 공유 추출)
```
> 1단계(지금)는 workbench + pipeline + kiwoom + sheet-core. theme-core/chart-core는 market-eye 흡수(2단계)로 미룸. 1단계에선 차트 컴포넌트를 workbench로 복사해 쓰고, 2단계에서 chart-core로 추출.

---

## 2. 재활용 맵 (소스 → 목적지 → 모드)

| 소스 | 목적지 | 모드 | 비고 |
|---|---|---|---|
| `packages/data-core/**` (+`__tests__`) | 그대로 | **유지** | 쿼리·repo·service·schema·market-feature/calculators. workspace import. ★스키마 손대지 말 것 |
| `apps/batch/src/clients/*` (kiwoomClient, tokenManager, config, decorators, types) | `packages/kiwoom` | **추출** | import 경로만 수정 |
| `apps/batch/src/services/assemblers/candleAssembler.ts` (+test), `csv/*`, `mappers/*`(kiwoomNumberParser·dateTimeParser·priceCalculator·marketDataMapper), `marketService.ts` | `packages/pipeline` | **추출** | 테스트 동반. 스테이지로 재배치 |
| `apps/feature-processor/src/**` | `packages/pipeline` (feature 스테이지) | **추출** | |
| `apps/chart-review/src/actions/sheet.ts`, `lib/parseSheet.ts`, `lib/sheetsWriter.ts`, `lib/readSheetConfig.ts` | `packages/sheet-core` | **추출** | 읽기/쓰기/설정. market-eye `sheetsThemeSource.ts`와 2단계에서 통합(헤더 별칭·addMember) |
| `apps/chart-review/src/components/chart/**` | `apps/workbench` 로 **복사** | **복붙(렌더코어)** | 2단계에서 chart-core 추출. lightweight-charts v5 멀티pane 로직은 손대지 말 것 |
| `apps/chart-review/src/stores/*` (useReviewStore, useUiStore) | `apps/workbench` | **복사+조정** | 패널 구조에 맞춰 selection/필터 상태 정리 |
| `apps/chart-review/src/lib/*` (reviewCommands, selection, groupSheetRows, manualFilter, captureCsv, shortcuts, format, colors …) | `apps/workbench` | **선별 복사** | 순수 로직은 복붙, UI결합은 참고 후 재작성 |
| `apps/chart-review/src/components/review/ReviewWorkspace.tsx`, `app/api/review/*`, `actions/db.ts` | — | **참고만(새로)** | server action으로 통일해 재작성 |
| `apps/hypothesis-lab/src/**` (UI) | `apps/workbench` 가설 패널 | **참고만(새로)** | schema는 유지, UI는 패널로 새로 |

---

## 3. 새로 짤 것 (greenfield shell)
> ★UI 목표 = **HTS 클론**. 도킹으로 "여러 창 자유배치 + floating 겹침 + 타일링 + 모든 화면 종목코드 연동 + 화면구성 프리셋 저장"을 구현한다.
- **도킹 패널 쉘**: dockview(추천) 도입. 레이아웃 직렬화 저장/복원 — **번호 붙인 레이아웃 프리셋(HTS "창1/창2/창3...")을 숫자키/탭으로 빠른 전환.** 타일링 기본, 필요 패널만 floating(겹침). (브라우저 floating은 그 창 안에 갇힘 — 멀티모니터 독립창 스프레드만 약점, 한 화면 HTS엔 무관.)
  - ★기존 자산 활용: chart-review `useUiStore.quickPresetGroups` + 숫자키 1~4 프리셋(architecture.md)이 "창 번호 빠른전환"의 토대 → 이주. 프리셋이 저장하는 범위: v1=레이아웃만(연동종목은 글로벌 link 따라감), 옵션=레이아웃+종목 스냅샷. 저장: 혼자=localStorage / 공유=DB(호스팅 단계).
- **공유 상태 store(zustand) — "종목코드 연동"을 1급 개념으로**: 패널 간 연동의 단일 출처. 선택(stockCode·tradeDate·tradeTime), 뷰모드, 필터, 차트모드(krx/nxt). 패널은 prop 안 받고 store 구독 → 한 패널서 종목 바꾸면 전 패널 갱신(HTS 연동). **v1=글로벌 연동 1개. 확장 여지: HTS식 "연동 그룹(색깔)" — 패널이 어느 link 그룹이냐 + 그룹별 선택종목.** store를 처음부터 그룹 끼우기 쉽게 설계.
- **server action 통일**: 모든 데이터 접근은 data-core 호출 → 권한게이트 → DTO 매핑. **SQL은 data-core 밖으로 안 나가고, UI DTO는 data-core 안으로 안 들어옴.** route handler는 CSV 업로드 등 꼭 필요한 것만.
- **파이프라인 트리거 UI**: CSV/리스트 입력 → packages/pipeline 호출(server action + 진행률 스트리밍).

---

## 4. 패널 인벤토리 (초안)
| 패널 | 내용 | 데이터 |
|---|---|---|
| 작업셋/리스트 | 종목 리스트, 작업셋 전환, 배지(Point List 보유) | findReviewLoadTargets |
| 테마보드 | 테마별 등락률순 정렬(과거 데이터), 개잡주 필터링 | buildBoard(일반화) + feature |
| 차트 | 일봉/분봉, 테마 오버레이, price line | 번들쿼리(getThemeBundle 확장) |
| 타점입력 | 우클릭 price line, 매매대상 마킹, 수동 m_ 값 | review_point/lineTargets |
| 가설 | case 작성·관계·outcome | hypothesis schema |
| 뉴스(2단계) | (종목,시각) 윈도우 조회 | 뉴스 데몬 |

연동 예: 테마보드 패널에서 종목 클릭 → store.selected 갱신 → 차트·타점·가설·뉴스 패널 동시 갱신.

---

## 5. 단계별 순서 (점진 컷오버, 빅뱅 금지)
- **S0** decision 문서 읽기 + 이 계획 확정.
- **S1** workbench 스캐폴드: Next + dockview 빈 쉘 + 빈 패널 프레임. data-core workspace 연결, **기존 DATABASE_URL/스키마 그대로**.
- **S2** packages 추출: kiwoom, sheet-core, pipeline(batch+feature 흡수). 테스트 같이 이동·통과 확인.
- **S3** 차트 패널 + 작업셋 패널: 차트 컴포넌트 복사, 번들쿼리를 server action으로, 공유 store(선택) 배선. ← 첫 동작 마일스톤.
- **S4** 테마보드 패널: buildBoard를 quote-source 인터페이스로 일반화(라이브시세→그날 종가/등락률). 필터링 UX.
- **S5** 타점입력 패널: 우클릭 price line, 매매대상 마킹, 수동값.
- **S6** 가설 패널: hypothesis schema 연동, caseId↔review_target 매핑 확정.
- **S7** 파이프라인 트리거 패널: CSV→ingest→assemble→feature→classify, 진행률.
- **S8** 뉴스 패널(뉴스 데몬 이후, 2단계).
- **S9** 패리티 확인 → chart-review·hypothesis-lab·batch·feature-processor 제거.

---

## 6. 가드레일 (리라이트가 죽는 4지점 — 필수)
1. **테스트를 같이 이주**한다(= 도메인 명세). data-core·pipeline 테스트가 통과해야 "복붙이 안 깨졌음" 보증.
2. **decision 문서를 먼저 읽는다**(§0). 이미 푼 문제 재발 방지.
3. **DB 스키마 재사용**(새로 안 짬). 실데이터(candle·feature·review·hypothesis) 고아 방지. 같은 data-core/schema 위에 올림.
4. **빅뱅 금지·점진 컷오버**. workbench를 옆에 세우고 패널 단위로 포팅, 기존 앱은 패리티까지 병행 후 제거.

---

## 7. 열린 질문 (구현 중 결정)
- caseId(hypothesis) ↔ review_target 구체 매핑.
- 파이프라인 잡 실행: server action 동기+스트리밍 vs 별도 worker(개인 규모면 전자로 충분).
- 호스팅(2단계): 서울 VPS, app+DB co-locate, 수집 로컬→원격 push. 협업자 write 범위·동시편집(last-write-wins 가정).
- chart-capture 흡수 위치(pipeline 잡 vs 유지).
