# ADR-002: Chart Tooltip을 React 컴포넌트로

## 상태

Accepted (2026-05-08)

## 맥락

기존 세 차트 컴포넌트(`RealDailyChart`, `RealMinuteChart`, `RealThemeOverlayChart`)는 `subscribeCrosshairMove` 콜백 안에서 `tip.innerHTML = '<div style="...">...'` 형태의 인라인 HTML 문자열로 툴팁을 그렸다. 각 파일의 툴팁 조립 코드가 200줄 이상이었고, 스타일 토큰이 분산되어 있어 디자인 변경이 어려웠다. 타입 검증이 없어 데이터를 빠뜨려도 런타임에만 발견됐다. 분봉 툴팁에 테마 동반 종목 정보를 추가할 때 오버레이 툴팁 코드와 구조를 재사용하기 어려운 상황이었다.

## 검토한 대안

- **A: innerHTML 유지 + 템플릿 모듈화** — 긴 HTML 문자열을 별도 함수로 추출. 기각: 타입 안전성이 없고, React 생태계(CSS Modules, 테마 토큰)와 통합하기 어렵다.
- **B: React + portal (채택)** — `useCrosshairTooltip` 훅이 `render` 콜백에서 ReactNode를 받아 state에 저장. `ChartTooltip`이 `createPortal`로 차트 컨테이너에 마운트.
- **C: 외부 라이브러리** — Floating UI 등 포지셔닝 라이브러리 도입. 기각: 의존성 추가 대비 이미 `positionTooltip` 유틸로 충분히 해결된다.

## 결정

**B안** 채택. `useCrosshairTooltip` 훅이 RAF throttle 기반으로 crosshair 이벤트를 수신하고, `render(param)` 콜백이 ReactNode를 반환하면 state로 저장한다. `ChartTooltip` 컴포넌트가 `createPortal(content, containerRef.current)`으로 마운트되며, `useLayoutEffect`에서 `positionTooltip`으로 경계 보정을 한다. `DailyTooltip`, `MinuteTooltip`, `OverlayTooltip`은 각 차트별 콘텐츠 컴포넌트이며, `ThemeRowList`를 공유해 분봉·오버레이 툴팁의 종목 행 레이아웃이 일치한다.

## 결과

- **장점**: TypeScript가 툴팁 props 구조를 검증. CSS Modules로 스타일 분리. `ThemeRowList` 재사용으로 분봉·오버레이 시각 언어 일치. `innerHTML` 코드 완전 제거.
- **단점/한계**: React 컴포넌트를 Effect 내부에서 생성(JSX → 객체)하는 패턴은 익숙하지 않을 수 있다. portal 마운트 비용이 약간 추가되지만 60fps에 영향 없음을 확인했다.

## 관련

- 코드: `src/components/chart/shell/useCrosshairTooltip.ts`, `src/components/chart/tooltip/`
- 기능 문서: [`docs/architecture/chart-tooltip.md`](../architecture/chart-tooltip.md)
- 후속 ADR: 없음
