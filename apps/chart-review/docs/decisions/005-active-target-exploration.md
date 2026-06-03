# 005. 작업셋 밖 종목 탐색 + Point List 따라가기 (축 1)

> 상태: **방향 제안(미구현)** · 작성 2026-06-04
> 관련: [004 통합 번들 쿼리](./004-unified-stock-bundle-query.md)

탐색/타점 경험을 "작업셋 커서"에서 분리한다. 붙여넣기·히스토리·테마클릭으로
**작업셋 밖 종목도 제자리(in-place) 탐색**하고, Point List 패널이 **현재 탐색
중인 종목을 따라가게** 한다. 시트 소싱(축 2, 탭별 작업셋 전환)은 별도 문서.

설계 키: 새 상태 모델을 만들지 않고 **기존 `chartOverride`(=`effectiveStock`)
메커니즘을 확장**한다.

---

## 1. 사용자 결정 (이 대화에서 확정)

1. **밖 종목 타점 = 즉석 review_target 생성 안 함.** lineTarget 을 입력할 방법이
   없으므로 review_target 은 기존 CSV 로드 설정으로만 만든다.
   → **이미 review_target 인 종목만 포인트 입력 가능**, 아니면 입력 비활성.
2. **탐색 종목의 Point List 가 따라온다.** 마커 위치는 바뀌지 않는다.
   포인트를 선택해 마커를 옮기거나(탐색) 포인트를 추가/삭제(=target 인 경우)할 수 있다.
3. **lineTargets(차트에 그릴 선)도 탐색 종목 기준으로 그려진다.**
4. 작업셋 밖을 보는 동안 위치 인디케이터는 `-/N`. `a/d` 누르면 작업셋으로 복귀.
5. 종목코드는 6자리 **영숫자**(예: `0126Z0`). 파싱이 숫자만 가정하면 안 됨. ✅(완료)

## 2. 데이터 경로 — 별도 라우트 불필요

`getThemeBundle(code,date)` 가 **이미 모든 멤버**의 daily/minute/features/
review(points + lineTargets + payload m_값) 를 단순 쿼리 5개 `Promise.all`
(애플리케이션 조인, 복잡한 SQL JOIN 없음)로 내려준다(theme-bundle.ts:67-73).
탐색에 필요한 데이터는 이미 손에 있다 → 별도 요청은 같은 걸 다시 긁는 낭비.

손실 지점은 오직 **앱 DTO 변환(`buildThemeOverlayForBundle`)** 이 % 시리즈 +
`hasReview` 만 남기고 features/review/lineTargets 를 버리는 것. 따라서:

- DTO enrich: 멤버별 `lineTargets` / `reviewPoints`(reviewId,tradeTime,payload) /
  `isReviewTarget` 를 같이 실어보낸다.
- Point List·라인은 현재 `themes` 에서 `effectiveStock.stockCode` 멤버를 찾아
  렌더 → **추가 요청 0**. review_target 아니면(isReviewTarget=false) 입력 비활성(결정 1).

### 조회 쿼리는 2개로 충분 (사용자 확정)

- **A. (code,date) → 테마 번들**: 모든 멤버 풀데이터. 테마탐색/히스토리/복붙/
  작업셋차트 전부 이 경로(= chart-preview, effectiveStock 으로 keyed).
- **B. 작업셋 로드(keys)** → code/date/time/feature/lineTarget/m_ (필터용)
  = `findReviewLoadTargets`.
- 둘 다 단순 쿼리 + `Promise.all` 앱 조인. review/feature 리포지토리 공유.

### 미정 스코프 (메인 차트 무요청화)

테마 멤버 클릭 시 메인 daily/minute 차트를:
- (a) **번들에 이미 있는 `member.daily/minute` 로 그림 → 완전 무요청** (DTO 가
  멤버별 raw 차트까지 실어야 함, payload↑), 또는
- (b) 지금처럼 override 시 effectiveStock 으로 1회 refetch(메인차트만).

Point List/라인 무요청화는 (a)(b) 무관하게 위 DTO enrich 로 달성됨.

## 3. UI 와이어링 (ReviewWorkspace)

- `activeGroup = isOverride ? (fetched ?? 빈그룹) : selectedGroup`.
  - Point List, `dailyPriceLines`, 입력 드로어, 삭제가 모두 `activeGroup` 기준.
  - override 진입(테마클릭/붙여넣기)에서는 **마커 스냅 금지**(현재도 effect 가
    `selectedPoint.pointKey` 에만 반응하므로 유지). 탐색 리스트에서 포인트를
    클릭하면 그때만 마커 이동.
- `dailyPriceLines`: override 라고 `undefined` 로 강제하던 분기 제거 →
  `activeGroup` 의 선택 포인트 features.lineTargets 사용.
- 입력 활성 = `!isOverride || (fetched?.points 존재 = review_target)`.
- `navigateToGroupId`: 작업셋에 없으면 `router.push` 폴백 대신
  `setChartOverride({code,date})`. (히스토리 스위처 commit 도 동일 분기.)
- `a/d`(commands)는 작업셋 인덱스 기준 → `setSelectedGroupIndex` 가 override 를
  해제하므로 누르면 자연히 복귀.
- 위치 인디케이터: `isOverride && groups.findIndex(...)<0` → `-/N`.

## 4. 배지 3-state (테마 리스트)

지금 2-state(동그라미 = 포인트 보유). 3-state 로:
- 포인트 있음 → 채움 표식(모던하게, 동그라미 대체)
- review_target 이지만 비어있음 → 외곽선/약한 표식
- target 아님 → 없음
- 데이터: overlay series 에 `isReviewTarget`(review != null) 추가
  (기존 `hasReview` = points>0 와 병행). themeMetrics 에도 전파.

## 5. 스테이징

- **S1** DTO enrich: overlay series 에 `lineTargets`/`reviewPoints`/`isReviewTarget`
  추가(types/chart.ts, overlay.ts). 별도 라우트/훅 없음.
- **S2** ReviewWorkspace: `activeReview` = 현재 `themes` 에서 effectiveStock 멤버
  → Point List/라인/입력/삭제 배선. override 진입 시 마커 스냅 금지(현 동작 유지).
- **S3** 밖 탐색: navigateToGroupId/히스토리 → `router.push` 폴백 대신
  `setChartOverride`, 위치 인디케이터 `-/N`, `a/d` 복귀.
- **S4** 배지 3-state(overlay isReviewTarget → themeMetrics → ThemeSidebar).
- (선택) 메인차트 무요청화 = §2 스코프 (a). 별도 판단.
- (축 2) 시트 탭별 작업셋 전환 + Write append — 별도 문서/후속.
