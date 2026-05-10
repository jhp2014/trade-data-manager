# ADR-015: CSV `line_` prefix → 가격 라인 컬럼

**상태**: Accepted  
**날짜**: 2026-05-10

## 맥락

CSV에서 가격 라인 데이터를 옵션과 함께 다루면 옵션 필터·picker가 오염되고,
가격 컬럼을 옵션으로 필터링하는 것은 의미가 없다.
가격은 숫자이고 옵션은 문자열 값이라 처리 방식도 다르다.

## 결정

- 컬럼명이 `line_`로 시작하는 컬럼은 옵션이 아닌 **가격 라인 컬럼**으로 분리한다.
- 값은 `"|"` 구분 다중 가격 (예: `"15000|17500|20000"`).
- `loadDecksFromDir` 단계에서 `optionKeys`와 `priceLineKeys`로 분리한다.
- `DeckEntry`에 `priceLines: Record<string, number[]>` 필드 추가.
  - key는 CSV 컬럼명 그대로 (`"line_target"`).
  - value는 파싱된 숫자 배열. 파싱 불가 토큰은 제외.
- `LoadedDecks` / `LoadedDecksDTO`에 `priceLineKeys: string[]` 추가 (전 CSV 합집합).

## 차트 적용 규칙

- **일봉**: 가격 그대로 수평선 표시. Y축 레이블에 가격 표시.
- **분봉**: `prevCloseKrx` 또는 `prevCloseNxt` 기준으로 % 변환 후 표시.
  - `prevClose`가 null이면 미표시.
- **오버레이**: 미적용 (% 단위 종목별 시리즈가 다수라 의미 약함 — 추후 요구 시 별도 결정).
- 차트 레이블: prefix(`line_`) 제거 후 표시 (`line_target` → `target`).

## 결과

- 옵션 필터·picker에 가격 컬럼이 노출되지 않음.
- 일봉/분봉 차트에 `priceLineList` indicator를 통해 수평선이 그려짐.
- 기존 CSV (line_ 없음)는 `priceLines: {}`, `priceLineKeys: []`로 투명하게 처리됨.
