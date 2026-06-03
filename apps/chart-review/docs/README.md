# chart-review 문서

매매 복기 웹(`@trade-data-manager/chart-review`, Next.js App Router, port 3200)의 문서 모음입니다.

## 한눈에

- **무엇**: 수집·가공된 종목 데이터를 차트로 빠르게 넘겨보며 **타점(Point)을 입력·검토**하고, 결과를 Google Sheet로 내보내거나 시트에서 일괄 가져오는 도구.
- **진실 원천(SSOT)**: 모든 복기 데이터는 **PostgreSQL**(`review_target` / `review_point` / `review_manual_key`)에 있다. Google Sheet는 "어떤 종목을 볼지"를 고르는 **작업셋 정의**와 **사람이 보기 좋은 내보내기/가져오기 매체**로만 쓴다.
- **작업셋 = Read Sheet**: 보고 싶은 `(종목코드, 거래일)` 행만 담은 시트를 연결하면 그게 곧 복기 대상 목록이자 **북마크 컬렉션**이다. → [decisions/003](./decisions/003-read-sheet-as-bookmark.md)

## 문서 지도

| 문서 | 내용 |
|------|------|
| [usage.md](./usage.md) | 사용법 — 단축키, 작업셋/Read Sheet 운용, GroupId 점프, Export/Import |
| [architecture.md](./architecture.md) | 코드 흐름 — Sheet→DB 로딩 경로, 라우팅, 데이터 모델, 상태 관리, 디렉터리 맵 |
| [decisions/](./decisions/) | ADR — 주요 설계 결정 기록 |
| [spec/](./spec/) | 초기 작업 지시서(SPEC-phase1~5) — 역사적 기록(현재 상태와 다를 수 있음) |

## 빠른 실행

```bash
# 개발(HMR)
pnpm --filter chart-review dev          # → http://localhost:3200

# 빌드 후 실행(복기만 할 때 빠름)
pnpm --filter chart-review build
pnpm --filter chart-review start
```

자세한 운용은 [usage.md](./usage.md), 환경 변수는 루트 `.env.example`의 `review-ingest` 섹션 참조.
