> 이 파일이 답하려는 질문: 마우스를 움직였을 때 툴팁이 그려지기까지의 정확한 단계는?

# 차트 툴팁 (Chart Tooltip)

## 목적

3개 차트(분봉·일봉·오버레이)가 공유하는 hover 툴팁 인프라(훅 + 컴포넌트 + 포털)의 동작을 설명한다. 어떤 ref와 state가 어떤 순서로 바뀌는지 한 번에 파악할 수 있도록 한다.

---

## 흐름

### 1. lightweight-charts 이벤트 발화

lightweight-charts가 마우스 이동을 감지하면 `subscribeCrosshairMove(handler)`로 등록된 콜백을 동기적으로 호출한다. `handler`는 `useCrosshairTooltip` 훅 내 `useEffect`에서 차트 마운트 시 한 번 등록된다.

### 2. 경계 판정

```
handler(param):
    if (컨테이너 밖이거나 param.time 없음):
        cancelAnimationFrame(rafRef.current) + pendingRef = null
        setState({ visible: false })
        return
    else:
        pendingRef = param
        if (rafRef.current !== null) return  ← 이미 예약돼 있으면 skip
        rafRef.current = requestAnimationFrame(flush)
```

경계 이탈 시 즉시 `visible: false`로 setState해 툴팁이 사라진다. RAF는 최대 1개만 예약되어 여러 이벤트가 몰려도 다음 프레임에 한 번만 처리된다.

### 3. 다음 프레임 — `flush()`

```
flush():
    rafRef.current = null
    param = pendingRef.current; pendingRef = null

    if (컨테이너 밖): setState({ visible: false }); return

    content = renderRef.current(param)   ← 최신 render 콜백 호출
    if (content === null): setState({ visible: false }); return

    setState({
        content,
        x: param.point.x,
        y: param.point.y,
        visible: true,
        leftOffset: leftOffsetRef.current?.() ?? 0
    })
```

`renderRef`와 `leftOffsetRef`는 컴포넌트 렌더마다 갱신되는 ref로, 클로저 stale 문제를 방지한다.

### 4. render 콜백 — ReactNode 조립

차트 컴포넌트가 `useCrosshairTooltip`에 전달하는 `render` 콜백:

```
render(param):
    param에서 time, 가격, 거래대금 등 데이터 조회
    if (유효하지 않음) return null
    return <DailyTooltip .../> 또는 <MinuteTooltip .../> 또는 <OverlayTooltip .../>
```

반환된 ReactNode는 state에 저장된다. JSX는 React 엘리먼트 객체를 반환하므로 Effect 내부에서도 안전하게 생성할 수 있다.

### 5. 컴포넌트 렌더 — `<ChartTooltip>`

state가 변경되면 차트 컴포넌트가 리렌더되어 `<ChartTooltip>` 렌더:

```
<ChartTooltip visible={state.visible} x={state.x} y={state.y}
              containerRef={containerRef} leftOffset={state.leftOffset}>
    {state.content}
</ChartTooltip>
```

`visible = false`이면 `null` 반환 (포털 없음).

### 6. Portal + 위치 보정

`ChartTooltip`은 `createPortal(내용, containerRef.current)`으로 차트 컨테이너에 마운트된다. `TooltipInner` 내부의 `useLayoutEffect`가 DOM 업데이트 직후 실행:

```
useLayoutEffect([x, y, leftOffset]):
    positionTooltip(tipRef.current, container, x + leftOffset, y)
```

`positionTooltip`은 마우스 우하단에 배치하되, 컨테이너 경계를 초과하면 좌상단·좌하단 등으로 자동 보정한다.

### 7. 언마운트 정리

차트 컴포넌트 언마운트 시 `useEffect` cleanup:
```
cancelAnimationFrame(rafRef.current)
pendingRef.current = null
setState({ content: null, x: 0, y: 0, visible: false, leftOffset: 0 })
```

`chart.remove()`는 `useChartShell`의 cleanup에서 실행되며, 이 시점에 모든 `subscribeCrosshairMove` 구독이 함께 해제된다.

---

## 핵심 파일

| 파일 | 역할 | 주요 export |
|------|------|-------------|
| `src/components/chart/shell/useCrosshairTooltip.ts` | hover 훅 (RAF throttle + state 관리) | `useCrosshairTooltip` |
| `src/components/chart/tooltip/ChartTooltip.tsx` | 포털 셸 + `useLayoutEffect` 위치 보정 | `ChartTooltip` |
| `src/components/chart/shell/tooltipUtils.ts` | 경계 보정 함수 | `positionTooltip` |
| `src/components/chart/tooltip/DailyTooltip.tsx` | 일봉 6항목 툴팁 콘텐츠 | `DailyTooltip` |
| `src/components/chart/tooltip/MinuteTooltip.tsx` | 분봉 통합 툴팁 (self + peers) | `MinuteTooltip` |
| `src/components/chart/tooltip/OverlayTooltip.tsx` | 오버레이 툴팁 (시간 헤더 + 종목 그리드) | `OverlayTooltip` |
| `src/components/chart/tooltip/ThemeRowList.tsx` | 종목 행 그리드 (self 강조 + peers) | `ThemeRowList`, `OverlayTooltipRow` |

---

## 설계 결정

- **innerHTML → React 포팅 이유** — 기존에는 차트 컴포넌트마다 200+ 줄의 인라인 HTML 문자열이 있었다. 타입 검증이 없고, 다크/라이트 테마 토큰 적용이 어려우며, 분봉 툴팁을 오버레이와 통합할 때 구조를 재사용하기 어려웠다. React 컴포넌트로 전환함으로써 타입 안전성·재사용·분리가 가능해졌다. → [ADR-002](../decisions/002-chart-tooltip-react.md)

- **RAF throttle 채택 이유** — `setTimeout` debounce는 지연 시간(예: 200ms) 동안 마우스 위치가 이미 변했을 수 있어 툴팁이 뒤늦게 잘못된 위치에 나타난다. `requestAnimationFrame` 1회 예약은 브라우저 다음 페인트와 동기화되어 실제 화면 갱신 속도(≈16ms)에 맞게 툴팁이 따라온다.

- **portal target = 차트 컨테이너인 이유** — 툴팁을 `document.body`에 포털하면 차트가 스크롤 가능한 컨테이너 안에 있을 때 좌표 계산이 복잡해진다. 차트 컨테이너(`position: relative`) 안에 포털하면 `absolute` 좌표가 항상 컨테이너 기준이 되어 스크롤·z-index가 자연스럽게 관리된다.

- **`renderRef`/`leftOffsetRef` 패턴 사용 이유** — `useCrosshairTooltip`의 `useEffect`는 마운트 시 1회만 실행되어 클로저로 캡처한 `render`/`leftOffset`이 이후 렌더에서 오래된 값(stale closure)이 된다. ref로 항상 최신 값을 가리키게 하면 deps 배열 없이 최신 값을 사용할 수 있다.

---

## 확장 포인트

- **새 툴팁 추가** — `src/components/chart/tooltip/<Name>Tooltip.tsx` 작성 → 해당 차트 컴포넌트의 `render` 콜백에서 반환. `useCrosshairTooltip` 훅 자체는 수정 불필요.
- **행 형식 변경** — `ThemeRowList.tsx`만 수정. `OverlayTooltip`과 `MinuteTooltip` 두 툴팁이 동시에 변경됨.
- **위치 정책 변경** (예: 항상 우상단 고정) — `src/components/chart/shell/tooltipUtils.ts`의 `positionTooltip` 함수만 수정.
- **throttle 방식 변경** — `useCrosshairTooltip.ts`의 RAF 예약 로직을 교체. 외부 인터페이스(`render` 콜백, 반환 `state`)는 변경 없음.
