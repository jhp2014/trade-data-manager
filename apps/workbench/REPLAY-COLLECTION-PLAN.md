# 복기 데이터 수집·재구성 계획 (거래대금/등락률 순위 복원)

> **콜드 인수인계용.** 이 대화 맥락 없이 이 파일만 읽고 이어갈 수 있게 썼다.
> 상위 계획은 같은 폴더 [`MIGRATION-PLAN.md`](./MIGRATION-PLAN.md)(workbench 통합), 배경은 Claude 메모리 `hts-consolidation-design.md` / `replay-collection-design.md`.
> 이 문서는 그 계획을 **충돌 없이 확장**한다. 코드는 탐침 결과 확정 후 진행(현재 미착수).

---

## ⏩ 현재 상태 (이어가기 · 2026-06-27)
설계 확정 + recon 08 실행 완료. 키움 유니버스/제외 챕터 **닫힘**.

### ✅ 이번에 확정·반영된 것
- **recon 08 실행 완료**(20260626): 분포·프루닝 후보수·KRX/NXT·marketName 분포 측정 → §7 반영.
- **제외 = marketName 단일 기준**: `getStockList(ka10099)` 가 marketName ∈ {거래소,코스닥} 개별주식만 반환(2742). ETF/ETN/리츠/펀드 제외. kind=Q==ETN 확증. (이전 kind/스팩/ETF별도시장 분류 폐기.)
- **시변 audit 제외 폐기** → 일봉(traded&amount>0)으로 필터(§1). 일봉 `trde_prica` 단위=**백만원** 확인.
- **어댑터 분리**: 필터/조합은 도메인, 키움은 raw 종목만. `getStockList` 추가(필터는 잠정 어댑터 내장). 커밋 `feat(kiwoom): getStockList ...`.

### ▶ 다음 액션 (별도 세션)
- **KIS recon** — [[kis-api-addition]] 패키지 골격 완료. `.env` 채우고 recon:token→minute→minute-history (누적거래대금·과거분봉 깊이 확정).
- **도메인 서비스 + provider-중립 포트**(`MarketDataPort` 등) — KIS recon 후 pipeline 세션. 필터/프루닝/랭킹·키움+KIS 조합을 인터페이스 뒤로. (지금 어댑터에 둔 marketName 필터도 이때 도메인으로 이동.)
- 미결: §9 열린 질문 + KRX/NXT 순위 기준 + 당일테마 입력 UI 시점. 구현 순서 §8.

### 이미 확정(요약)
헥사고날 포트4·의존역전·DI수동(§2) · 유니버스=ka10099·**제외=marketName**·분봉거래대금없음→Σ(가×량)[KIS 누적거래대금으로 대체 가능](§7) · 2층 테마 Sheet일반/DB당일(§4) · 선택저장+용량~10GB/년(§5) · provenance daily write-once·시변 audit제외 폐기→일봉필터(§1).

이미 한 recon: `recon:stocklist`(07) · `recon:scan`(08, 실행완료).

---

## 0. 목적 (왜)

장중 조건검색식(거래대금 상위·등락률 상위)은 **실시간 전용** — 당일이 지나면 API로 못 받는다.
→ REST로 **전종목 일봉+분봉**을 받아 **자체 필터링/순위 재구성**으로, 복기 시 "그날의 거래대금/등락률 상위"를 실시간처럼 본다.
부수 목표: ① 그동안 HTS에서 **수동으로 만들던 batch 입력 자료를 자동화**(수동 탈출). ② 테마별로 정리해 복기.

핵심 통찰: **랭킹은 저장하지 않는다.** 분봉(누적거래대금)만 있으면 분당 순위는 읽을 때 정렬로 재구성된다.

---

## 1. 확정된 결정 (이 논의에서)

- **조건식(실제)**: `(등락률 탑50 & 거래대금 탑400) or 거래대금 탑100`.
  - **꼭 똑같을 필요 없음.** "쓰레기 종목까지 걸리면 볼 종목은 다 들어온 것" — 근사 허용. 컷은 탐침으로 조정.
  - **제외 = `marketName` 기준 (실측 20260626 확정)**: `getStockList(ka10099)` 가 **marketName ∈ {거래소(=코스피), 코스닥} 개별주식만** 반환. ETF/ETN/리츠/인프라/뮤추얼은 marketName 으로 깨끗이 갈려 제외(거래소920+코스닥1822=주식2742; ETF1145·ETN379·리츠23·인프라2·뮤추얼1). 우선주(kind=A)·외국기업 포함. ⚠️**코스피는 marketName="거래소"**(="코스피" 아님). ※기존 `kind=Q`(ETN)·`companyClassName="스팩"`·`mrkt_tp=8 ETF자동제외` 식 분류는 **폐기** — marketName 단일 기준으로 통합(kind=Q==ETN 379 일치로 확증됐으나 marketName 이 ETF까지 한 번에 가름). 필터는 어댑터 `getStockList` 에 내장(개별주식만 쓰므로). 시변 아닌 구조 분류라 백필 포함 항상 적용.
  - **[갱신 2026-06-27] auditInfo(시변 메타데이터)로는 당일이든 백필이든 일괄 제외 안 함.** (이전 '당일 수집만 적용' 분리 정책 → **폐기**.)
    - 근거: ka10099 의 `auditInfo`/`state` 는 당일 종가 반영이 **익일 새벽(~05시) 갱신** → 호출 시점 기준 **항상 ~T-1 상태**(키움 REST Q&A 확인). 당일 저녁에 돌려도 그날 상태가 아니라 전일 상태라 못 믿고, 과거 baseDate 백필 시에도 "그 날짜 상태"가 아니라 ~T-1 이라 시점이 어긋남.
    - 대안: **시점 정확한 사실인 "일봉"으로만 필터**. 거래정지=baseDate 캔들 없음→`traded=false` 자연탈락, 거래대금0=`amount>0`에서 탈락, 관리/환기 류는 순위 프루닝이 거름. 못 믿을 메타데이터에 의존 안 함.
    - 반영: recon `08-scan-prune.ts` 에서 `EXCLUDE_AUDIT` 제거 완료(일봉 필터로 대체). 실제 ingest 스테이지도 동일 원칙.
- **프루닝(2패스)**: 일봉(전종목, 쌈) → 후보만 분봉.
  - drop 규칙: **`고가등락률 < 5% AND 일거래대금 < 300억`이면 버림**(= 합집합 keep). 이런 날/종목은 어차피 조건에 안 걸림 → 안전.
  - 정밀화: 거래대금은 **일총액 순위 ≤ N**(고정금액보다 안전, N은 탐침으로 ~500 결정). 등락률은 **느슨한 컷(2~3%)** 유지 — thin 게이너가 거래대금 탈락해도 **등락률 탑50 컷 자체를 밀어올리므로** 순위 정확도 위해 포함 필요.
  - "약한 날"(컷이 5%/300억 밑으로 내려가는 한산한 날)은 **신경 안 씀**(그런 데이터 불필요).
- **해상도 근사**: 1분봉 기준. 등락률은 분봉 고가가 잡아주고 누적거래대금은 분 마감 기준 — 실시간과 1:1 아님(합의). 특히 라이브의 **sub-minute 주목/델타 신호는 복기서 거칠어짐**.
- **백필**: 키움 분봉 TR `base_dt`(기준일자) **점프 됨** → `(후보, 날짜)` 콕 집어 수집(sweep 불필요). 일봉은 종목당 1콜 범위조회로 전종목·전기간 프루닝. **~8개월**(키움이 1년만 제공).
- **출처 우선순위(provenance)**: `daily`(당일 수집)는 그 날짜에 **권위적·write-once**. 나중 백필이 `daily` 날짜를 **덮지 않음**(백필은 `daily` 없는 날짜만). **시점고정층(관리/거래정지/환기/시총/상장주식수)은 당일 job만 기록**, 백필은 손 안 댐(과거 시변상태는 근사 불가 → 무시). ⚠️ 단 auditInfo(관리/정지/환기)는 당일 job 에서도 ~T-1 lag(위 갱신) → 기록한다면 "전일 상태"로 라벨, 필터엔 안 씀. (이 층에서 audit 자체를 뺄지는 미결.) 일봉은 **원주가(무수정) 저장**으로 불변성 유지(나중 재fetch 시 수정주가로 달라지는 것 방지).

---

## 2. 아키텍처 — "하나의 프로세스" = workbench 단일 앱

MIGRATION-PLAN의 **workbench(Next + dockview) 단일 앱 + 패널 + 공유 패키지** 구조가 그대로 답.
라이브/복기는 **소스만 교체**하는 같은 패널.

### 단 하나의 개념 업그레이드: 시간 인덱스 Snapshot 소스
MIGRATION-PLAN S4의 quote-source는 "그날 종가/등락률"(EOD 1장). 복기는 **분당 스크럽 + 라이브 + 키움 재구성 + diff**가 필요하므로 시각 T 기반으로 올린다:

```
SnapshotSource.at(date, time)      → Snapshot   // 복기-DB: minute_candle_features 조회·정렬
SnapshotSource.live()              → push       // 라이브: WS (현 market-eye 엔진)
SnapshotSource.rebuild(date, time) → Snapshot   // 키움 재구성: 분봉 재fetch 후 재계산
diff(dbSnap, rebuildSnap)                        // DB vs 키움 차이
```
패널(테마보드·차트)은 소스가 뭔지 모름 → 라이브/복기/diff가 전부 소스 교체로 끝. `Snapshot` 계약은 market-eye `src/shared/snapshot.ts`(`SourceStock`/`HotStock`/`Snapshot`)를 그대로 차용.
`data-core` `idx_minute_features_search (trade_date, cumulative_trading_amount, close_rate_nxt)`가 이미 이 조회를 노리고 박혀 있음.

### 계층(헥사고날) & 포트 — 의존은 안쪽으로만 ★
이 시스템의 핵심 요구("같은 UI 뒤 소스 교체: 라이브 WS / 복기 DB / 키움 재구성")가 곧 **포트 & 어댑터**다. market-eye `ThemeSource`(+Sheets/Local 구현)가 이미 그 패턴.

**4계층 · 의존은 안쪽으로만**: `앱 → 서비스(application) → (포트) ← 어댑터 → 도메인`
| 계층 | 정체 | 예 | IO |
|---|---|---|---|
| 도메인(순수) | 입력→출력 계산. 의존 0 | `chart-utils`, data-core `market-feature` 계산기, (예정)프루닝·순위·Snapshot assemble | ❌ |
| 게이트웨이/어댑터 | 외부통신 | `kiwoom`(키움 전송), `google`(시트), `data-core`(Postgres) | ✅ |
| 서비스(조합) | 유스케이스 | (예정)pipeline·collector·복기재구성·뉴스 | 포트 호출 |
| 앱(쉘) | UI/배포 | `workbench`, cron | UI |

**핵심 규칙**: 포트(인터페이스)는 **안쪽이 소유**하고, 어댑터가 그걸 향해 의존(=의존 역전). 인터페이스만 만들고 코어가 kiwoom를 import하면 역전 안 된 것. 코어는 **정제된 도메인 모델**만 안다(소스 무관 단일 어휘).

**DI 컨테이너 불필요**: 역전 = 생성자 주입. 조립은 composition root(앱/cron 진입점) 한 곳에서 **수동 배선**(`createKiwoom()`이 이미 그 패턴). tsyringe/inversify는 솔로엔 과설계 → 안 씀. 테스트는 fake 어댑터 주입.

**포트 4개**(2+ 구현 or 격리테스트 필요한 것만 — 절제):
- `SnapshotSource`(아웃바운드) — 어댑터 LiveWs / ReplayDb / KiwoomRebuild ★복기 심장
- `ThemeSource`(아웃바운드) — Sheets / DB **(이미 있음)**
- `MarketDataPort`(아웃바운드) — kiwoom 어댑터. **반환은 도메인 `DailyBar`/`MinuteBar`, TR 1:1 거울 금지, 키움 타입 누출 금지**
- `CandleRepository`(아웃바운드) — data-core 어댑터. **data-core 안 뜯고** 얇은 매핑막으로 감싸기(가드레일 보존)

**정제(ACL) 배치**: `kiwoom`는 "멍청한 전송"(키움 와이어 포맷만, 도메인 무지)으로 두고, **별도 `KiwoomMarketDataAdapter`가 `MarketDataPort` 구현 + 키움→도메인 변환**. → batch의 `kiwoomNumberParser·dateTimeParser·priceCalculator·marketDataMapper·candleAssembler`가 바로 이 ACL 코드 → pipeline 이주 시 어댑터 뒤로 재배치(새로 짜는 게 아님).

**과설계 경고**: 메시지 브로커/Producer/Consumer 없음(안 만듦). 2번째 구현이 영원히 없을 것엔 포트 안 만듦.

### 폴더 taxonomy (점진, 빅뱅 리네임 금지)
- **`services/` 한 칸 신설**(application: pipeline·collector). MIGRATION-PLAN은 pipeline을 `packages/`에 뒀는데 이걸 `services/`로 **갱신**.
- **`packages/contracts`(또는 `domain`) 신설**: 포트 + 정제 도메인 타입(shared kernel of interfaces). 어댑터·서비스 양쪽이 의존.
- 기존 `kiwoom`/`google`/`data-core`/`chart-utils`는 **리네임 X, 역할 라벨만**(어댑터/도메인). 물리 풀전환(domain/adapters/ 폴더)은 churn>이득이라 보류.

### board-core / market-eye 흡수
- **board-core 추출은 불필요(지금)**: 라이브·복기 소스가 둘 다 workbench 안 → `src/shared` 그대로 재사용. 세 번째 소비자 생기면 추출.
- **2단계**: market-eye 흡수 → `theme-core`(buildBoard)·`chart-core`(lightweight-charts). 라이브=push 소스, 복기=DB 소스, **같은 패널**.

---

## 3. 데이터 모델 — 기존 스키마 ~80% 재사용 + 소수 델타

기존 `packages/data-core/src/schema/*` 그대로 쓴다(★스키마 손대지 말 것 원칙). 이미 있는 것:

| 테이블 | 비고 |
|---|---|
| `stocks` | 종목 마스터(code·name·market·nxt·regDay) |
| `themes` | 테마 마스터(themeId·themeName unique) |
| `daily_candles` | 일봉 KRX+NXT, `market_cap`·`listed_shares`·`floating_shares`·`prev_close_*`. 전종목 프루닝 입력 |
| `minute_candles` | 분봉 OHLC·volume·`trading_amount`·**`accumulated_trading_amount`(누적거래대금=순위 입력)**·rate KRX/NXT |
| `minute_candle_features` | calculator 파생(cumAmount·closeRate·dayHigh·pullback) + **순위용 인덱스** |
| `daily_theme_mappings` | themeId ↔ dailyCandleId **N:M(한 종목 그날 다중 테마 이미 지원)** |
| `review_target` | `line_targets jsonb number[]`(=price line)·stockCode·tradeDate |
| `review_point` / `review_manual_key` | 타점·수동입력 키 레지스트리 |
| `intraday_program_amounts` | 프로그램 매매(금액) |

### 델타(추가/변경) — 탐침 후 확정
1. **`daily_theme_mappings`에 컬럼 추가**: `theme_source`(general=Sheet / daily=당일이벤트), `issue`(당일 편입이슈 텍스트, 대개 빈값), `inclusion_reason`(5%고가 / 순위 / both).
2. **신규 `daily_review_status`(날짜별)**: 상태 `미완료`(데이터 없음) / `수집됨`(데이터 O, 미검수) / `완료`(테마 검수까지 수동 체크). 백필 달력 패널의 기반 + provenance(`source` daily/backfill, `collected_at`).
3. **`pipeline` 자동스캔 ingest 스테이지**: 기존 ingest는 HTS CSV 전제 → **유니버스를 스스로 생성**(전종목 스캔→프루닝→분봉 재구성). 이게 가장 큰 신규.
4. **news-core 패키지 + 뉴스 패널**(2단계, §6).

---

## 4. 테마 — 2층 모델

| 층 | 내용 | 저장처 | 누가 |
|---|---|---|---|
| **일반 테마** | 종목 평소 정체성(2차전지 등) | **Google Sheet**(진실원본) | 라이브(market-eye) 분류 |
| **당일 테마 + 이슈** | 그날 새 이슈로 엮인 테마(초전도체 등), 모호하면 이슈 메모 | **DB**(`daily_theme_mappings`, 날짜별) | 복기 |

- **자동 시드 + 수동 보정**: 수집 시 Sheet를 읽어 **당일 테마 초안 = 그날 일반테마 스냅샷**(시점 고정). 아무것도 입력 안 하면 이 Sheet 테마가 당일 테마가 됨. 복기하며 drag&drop/입력으로 당일 테마·이슈 추가·정정. Sheet 테마는 안 사라짐 → 한 종목 그날 2~3 테마 가능(N:M).
- **라이브=Sheet 기준, 복기=DB 기준**(그날 스냅샷+당일). 출처가 다르니 자연히 갈림(모순 아님).
- **입력 UI**: 같은 테마보드, 라이브 모드 write=Sheet(`addMember`), 복기 모드 write=DB.
- 복기 themes = {그날 일반테마 스냅샷} ∪ {당일 추가테마}, 이슈까지 있으면 "왜 거기 엮였나"까지 복원.

---

## 5. 선택적 저장 (DB 절약)

- **일봉: 전종목 다 저장.** 백필은 ka10081 범위조회로 **종목당 1콜에 8개월 통째** → 유니버스 **1회 스캔(~4292콜)**, 재스캔 없이 저장된 일봉에서 **날짜별 프루닝 계산**. 조건 바뀌면 재프루닝만. 용량 무시(~0.4GB/년).
- **분봉(무거움)**: **순위 재구성에 필요한 종목만** 저장. 5%고가만 걸린(테마 개관용) 종목은 분봉 생략 가능.
  - 기존 스키마가 자연 지원: `daily_theme_mappings`는 `dailyCandleId` 참조 → 일봉만 있어도 테마 매핑 가능, `minute_candles` 없어도 됨.
  - 복기 정리 화면에서 "분봉 저장 안 할 종목" 선택.
- **features 테이블은 옵션**: `minute_candles`에 이미 `accumulated_trading_amount`·`closeRate*` 있음 → **순위 재구성엔 `minute_candle_features` 불필요**(읽을 때 계산). persist 안 하면 용량 절반.

### 용량 추정 (보수적)
가정: 분봉 250종목/일 × 400봉 × 245일/년, 0.4KB/row(인덱스 포함).
- 분봉: 24.5M row → **~10 GB/년**. 일봉(전종목): ~0.4 GB/년. features persist 시 +~8 GB.
- → **순위 재구성만이면 ~10 GB/년**, 8개월 백필 ≈ ~7 GB. 5년 쌓아도 50GB대 — 부담 없음.

---

## 6. 복기 부가 기능

- **재열람·재구성·diff**: 완료 날짜는 DB 소스로 재현. 옵션으로 키움 재구성(`rebuild`). **DB vs 키움 차이를 diff 뷰**로 구별(데이터 신뢰/수정주가 변화 점검).
- **차트 price line + 매매대상**: `review_target.line_targets` 재사용. 복기 화면서 **언제든 review 대상 추가/제거**(기존엔 가변 입력 어려웠음).
- **뉴스(2단계)**: **GramJS(텔레그램) + 네이버 API**로 `(날짜, 종목)` 이슈 검색. **검색 로직=news-core 공유**, 패널 UI는 라이브/복기 각자. 라이브 market-eye와 진짜 복기 양쪽에 부착.

---

## 7. 탐침 — 위치 & 진행

위치: **`packages/kiwoom/recon/`** (throwaway는 전송 게이트웨이 곁. 영구 ingest는 나중 `services/pipeline`). DB 저장 없이 콘솔/파일.
대상: 최근 거래일 1개(**검증창은 "오늘/최근일"** — 과거 조건검색 결과가 없어 라이브와 대조 가능한 유일 시점).

### ✅ 확정된 발견 (recon 07-stocklist + 코드 리딩)
- **유니버스 = `ka10099`(종목정보 리스트, `/api/dostk/stkinfo`, `mrkt_tp`). 코스피(0) 2470 + 코스닥(10) 1822 = 4292종목, 시장당 1콜(페이지네이션 X).** 리스트 키 `list`.
- **제외 = `marketName` (recon 08 실측 20260626 확정)**: ka10099 mrkt_tp 0/10 응답에 **ETF·ETN·리츠·펀드가 섞여 옴**(시장코드 표와 다름 — 키움 문서 부실). marketName 분포: 코스닥1822·거래소920(=개별주식 2742)·ETF1145·ETN370·리츠23·ETN변동성8·인프라2·뮤추얼1·ETN손실제한1. → **marketName ∈ {거래소,코스닥} 만 통과**. ⚠️코스피=marketName"거래소". **kind=Q==ETN 379 정확 일치로 확증**(이전 추측 종결). ETF가 거래대금 top30 중 ~20개 잠식 → 제외 필수. `kind` A=일반주(우선주 포함). `upName` ETF/ETN=빈값(보조 식별, marketName 이 더 정확). **auditInfo/state 는 ~T-1 lag(§1)라 제외에 안 씀** — 일봉(traded&amount>0)으로 거름. 필터는 어댑터 `getStockList` 에 내장.
- **시총 = `listCount`(상장주식수)×`lastPrice`(전일종가)** → ka10001 생략 가능. `nxtEnable`·`regDay`도 ka10099에.
- **ka10080 분봉엔 거래대금 필드 없음**(`cur_prc·trde_qty·cntr_tm·open/high/low`만) → 누적거래대금 = **Σ(종가×거래량) 근사**.
- **ka10081 일봉엔 `trde_prica`(거래대금, **단위 백만원** 실측 확인)·`high_pric`(고가) 있음** → 프루닝 입력 OK. (`upd_stkpc_tp:"1"`=수정주가 — §1 원주가 결정과 충돌, 백필 시 `"0"` 검토.)
- kiwoom 헬퍼: `getDailyChartsByCount`, `getMinuteChartsForDate`(최신→과거, base_dt 종료조건 내장, `_AL`=NXT통합).

### ✅ recon 08 실측 결과 (20260626 — 개별주식 2742 기준)
- **분포**: 거래일 데이터 traded 종목, 고가등락률 ≥2%/≥3%/≥5% 분포 측정됨(로그 `logs/raw-samples/scan-prune-20260626-*.json`).
- **프루닝 후보수**(거래대금순위 N ∪ 고가등락률 cut): N400×cut3 ≈ 3200대(개별주식만 기준). N·cut 최종값은 ingest 설계 시 확정.
- **분봉 base_dt 점프**: 상위 후보 900봉/콜, 최신→과거 정상 동작(`getMinuteChartsForDate`).
- **KRX vs NXT(_AL)**: 대형주는 _AL(NXT통합)이 KRX의 ~1.5배(거래 분산). 순위 기준(KRX vs _AL) 결정은 미결 → ingest 시.
- **thin 게이너**: 등락률 탑50 중 거래대금 rank>400 = 소수(§1 등락률 컷 느슨 유지 근거).

탐침 결과로 확정: 제외=marketName·일봉필터·거래대금 단위(백만원). 남은 결정(N·cut 최종, KRX/NXT 순위 기준)은 ingest 설계 단계로 → §3 델타 스키마 → 시간인덱스 소스.

---

## 8. 순서 (점진)

1. **탐침**(§7) ← 지금.
2. `daily_theme_mappings` 델타 + `daily_review_status` 스키마(data-core).
3. `pipeline` 자동스캔 ingest(전종목→프루닝→분봉) + provenance/멱등 백필.
4. 시간인덱스 SnapshotSource(DB) + 복기 패널(테마보드·차트, market-eye `src/shared` 재사용).
5. 백필 달력(완료/미완료) + 테마 검수 UI(drag&drop·당일테마/이슈·분봉 저장 선택).
6. rebuild 소스 + diff 뷰.
7. news-core + 뉴스 패널(2단계, market-eye 흡수와 함께).

---

## 9. 열린 질문

- 순위 기준 KRX vs NXT(또는 통합) — 탐침에서 데이터 보고 결정.
- 분봉 잡 실행: 서버액션 동기+스트리밍 vs 워커(MIGRATION-PLAN §7과 동일 — 개인 규모면 전자).
- `daily_theme_mappings` 델타를 컬럼 추가로 갈지 별도 매핑 테이블로 갈지(★기존 스키마 보존 원칙과 조율).
- 당일 테마 입력 UI를 market-eye 흡수(2단계) 전에 workbench 임시 패널로 먼저 낼지.
