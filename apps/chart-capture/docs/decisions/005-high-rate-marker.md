# ADR-005: variant별 prevClose 기준 high-rate marker

## 상태

Accepted (2026-05-11)

---

## 맥락

data-view 일봉 차트는 일중 고가 등락률이 10% 이상인 캔들에 색상 원형 마커를 표시한다. 캡처 이미지에서도 같은 시각적 단서가 있어야 DigiKam 분류 작업이 빠르다. chart-capture는 KRX/NXT variant별로 별도 PNG를 생성하므로, 등락률 계산의 분모(prevClose) 선택이 문제가 됐다.

---

## 검토한 대안

**A. data-view와 동일하게 항상 KRX prevClose 기준**
- data-view의 `RealDailyChart`는 ADR-009 정책에 따라 KRX prevClose를 분모로 고정한다.
- 기각 이유: chart-capture에서는 NXT PNG와 KRX PNG가 모두 KRX 기준이 되면 NXT 파일의 마커가 NXT 가격 움직임을 반영하지 못한다.

**B. variant별 prevClose로 분기 (채택)**
- KRX PNG: `prevCloseKrx` 기준, `krx.high`로 계산.
- NXT PNG: `prevCloseNxt` 기준, `nxt.high`로 계산.

**C. marker 생략**
- 기각 이유: 분류 작업 속도가 느려지고, data-view와 시각적 일관성이 깨진다.

---

## 결정

`DailyChart.tsx`에서 `useNxt ? c.prevCloseNxt : c.prevCloseKrx`를 분모로 선택해 등락률을 계산한다. 색상 매핑 함수(`highMarkerColor`)와 구간(10/15/20/25/30%)은 data-view와 동일하게 유지하고, `src/lib/chart/highMarker.ts`에 격리한다.

---

## 결과

**장점**
- KRX/NXT 파일 각각의 마커가 해당 시장 기준의 등락률을 나타낸다.
- 색상 구간 로직이 `highMarker.ts`에 격리되어 변경 시 한 곳만 수정.

**단점 / 한계**
- data-view(`RealDailyChart`)와 분모 기준이 다르다 — data-view는 KRX 고정, chart-capture는 variant별 분기. 두 화면에서 마커 표시 여부가 다를 수 있다.
- `prevCloseNxt`가 null인 캔들(NXT 상장 초기 등)은 marker가 없다.

---

## 관련

- 차트 컴포넌트 구조: [`docs/architecture/chart-rendering.md`](../architecture/chart-rendering.md)
- 구현 위치: [`src/lib/chart/highMarker.ts`](../../src/lib/chart/highMarker.ts), [`src/components/chart/DailyChart.tsx`](../../src/components/chart/DailyChart.tsx)
- data-view ADR-009: `apps/data-view/docs/decisions/009-daily-chart-krx-nxt-toggle.md`
