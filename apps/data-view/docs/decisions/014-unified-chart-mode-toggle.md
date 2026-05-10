# ADR-014: 차트 모드 토글 통합

**상태**: Accepted  
**날짜**: 2026-05-10  
**Supersedes**: ADR-009

## 맥락

ADR-009에서 일봉 차트 내부에만 KRX/NXT 토글이 있었다.
분봉·오버레이도 KRX/NXT 데이터를 갖게 되면서(ADR-013), 한 모달 내에서 차트별로
다른 모드를 보는 사용 시나리오는 의미가 없어졌다.
토글 위치를 모달 헤더로 올리면 탭 전환 시에도 모드가 유지된다.

## 결정

1. `useUiStore.dailyChartPriceMode` → `chartPriceMode` 로 이름 변경 (의미 확장).
2. 토글 UI를 모달 헤더(`ChartModal.tsx`)로 이동. 일봉 차트(`RealDailyChart`) 내부 토글 제거.
3. persist 키 마이그레이션:
   - `version: 1 → 2`
   - 기존 `dailyChartPriceMode` 값이 있으면 `chartPriceMode`로 이전 후 제거.
   - 없으면 기본값 `"krx"`.
4. 세 차트(일봉·분봉·오버레이) 모두 `useUiStore((s) => s.chartPriceMode)` 구독.

## 결과

- 탭(일봉/분봉/오버레이) 전환 시 모드 유지.
- localStorage 마이그레이션으로 기존 사용자 설정 보존.
- 일봉 차트 컴포넌트 CSS(`RealDailyChart.module.css`)의 toggle 클래스는
  `ChartModal.module.css`로 이전 후 파일 내용 비움.
