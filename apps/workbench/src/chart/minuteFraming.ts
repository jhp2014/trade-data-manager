// MinuteChart 의 표시범위(f 줌·세션 프레이밍·스케일 고정) — 세션 시각 상수의 집.
// 시리즈/데이터는 minuteSeries, 오버레이는 minuteOverlays, 마우스는 minuteInteraction.
import { useEffect, useRef, type RefObject } from "react";
import { type IChartApi } from "lightweight-charts";
import { minutesOfDay } from "../lib/date.js";
import { type MinutePoint } from "../lib/derive.js";
import { indexAtOrBefore } from "../lib/chartFrame.js";

const LEFT_MARGIN_BARS = 10; // 좌측 여백(빈 논리 인덱스) — 봉이 축에 바짝 붙지 않게 + 개장 -10분 "여유"
const RIGHT_MARGIN_BARS = 2; // 우측 여백 — 15:30 종가봉이 축에 바짝 붙지 않게
const PREMARKET_OPEN_MIN = 8 * 60; // NXT 프리마켓 개장(08:00) — 프리마켓 봉 있는 UN 종목 세션 시작
const REGULAR_OPEN_MIN = 9 * 60; // 정규장 개장(09:00) — KRX 전용(프리마켓 없는) 종목 세션 시작
const SESSION_CLOSE = "15:30:00"; // 기본 뷰 우단 — 종가 단일가까지. 시간외(~20:00)는 줌아웃/스크롤로 접근

/** 표시 범위 — f 줌: anchor 중심 ±bars/2 봉 / 축소: 세션(프리마켓 있으면 07:50, 없으면 08:50 ~ 15:30).
 *  둘 다 논리 인덱스로 프레임(음수 from = 실제 좌측 빈칸, densify 로 분당 연속이라 논리 1칸 = 1분).
 *  데이터셋(frameKey=code:date)·줌이 바뀔 때만 프레이밍 — 같은 데이터셋의 라이브 틱(폴 갱신)은 사용자
 *  줌/이동을 보존한다(setData 는 범위 유지, 새 분봉은 shiftVisibleRangeOnNewBar 가 우측에서만 추종).
 *  lockTimeScale(스케일 고정) — 종목/날짜 전환(frameKey 변경) 시 직전에 보던 **clock 시각 창**을 유지한다.
 *  두 종목의 첫 봉 시각 차(프리마켓 유무=08:00 vs 09:00)만큼 논리 인덱스를 밀어(shift) clock 기준 동일하게
 *  맞춘다 → NXT↔KRX전용 전환도 60분 안 밀림(KRX 전용은 앞에 빈칸이 더 생길 뿐). 복원 원본(범위+첫봉시각)은
 *  cleanup 에서 setData 이전에 캡처 — 뷰가 우측끝이면(KRX 전용=시간외 없어 세션뷰가 곧 우측끝) setData 가
 *  최신 봉을 추종해 스냅되므로, 스냅 이전 값을 잡아야 한다. 첫 마운트는 프레이밍. f 줌 토글은 아래로 흘러 반영. */
export function useMinuteVisibleRange(
    chartRef: RefObject<IChartApi | null>,
    points: MinutePoint[],
    zoom: { bars: number; anchorTime: number | null } | null,
    frameKey: string,
    bumpOverlay: () => void,
    lockTimeScale = false,
): void {
    const prevFrameKeyRef = useRef<string | null>(null); // 직전 데이터셋 — 고정 시 "전환 vs 첫 마운트" 구분용
    const lockedRef = useRef<{ from: number; to: number; firstMin: number } | null>(null); // 전환 직전 뷰(clock 복원용)
    const lockRef = useRef(lockTimeScale); // 토글 자체는 리프레임 트리거가 아님(켜는 순간 뷰 안 움직임) → ref 로만 읽는다
    lockRef.current = lockTimeScale;
    // 리프레임 트리거는 effect 의존성 비교가 곧 가드 — frameKey(데이터 파생)·줌이 바뀔 때만 돈다.
    // points 는 의도적으로 의존성 제외(라이브 틱마다 참조만 바뀜): frameKey 가 데이터에서 파생되므로
    // 데이터셋이 실제로 바뀌면 frameKey 도 같은 렌더에서 함께 바뀐다 — 여기선 최신 points 를 읽기만 한다.
    const zoomSig = zoom ? `${zoom.bars}:${zoom.anchorTime}` : "session";
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || points.length === 0) return;
        const ts = chart.timeScale();
        const prevFrameKey = prevFrameKeyRef.current;
        prevFrameKeyRef.current = frameKey;
        const firstMin = minutesOfDay(points[0].tradeTime); // 이 데이터셋 첫 봉 분(分) — clock↔논리인덱스 변환 기준
        // 스케일 고정 — 전환이면 직전 clock 창 복원. 첫 봉 시각 차만큼 논리 인덱스 시프트(논리 1칸=1분)해
        // clock 기준 동일하게 유지(NXT↔KRX전용도 60분 안 밀림). 첫 마운트(prevFrameKey null)는 프레이밍.
        if (prevFrameKey !== null && prevFrameKey !== frameKey && lockRef.current && lockedRef.current) {
            const shift = lockedRef.current.firstMin - firstMin;
            ts.setVisibleLogicalRange({ from: lockedRef.current.from + shift, to: lockedRef.current.to + shift });
        } else if (zoom) {
            // 앵커 시각 ≤ 마지막 봉 인덱스. 앵커가 **첫 봉보다 이전**이면 첫 봉(indexAtOrBefore 가 0 반환) —
            // 예전엔 기본값 length-1 이 남아 세션 끝으로 점프했다. 앵커 없음(null)=마지막 봉 중심.
            const idx = zoom.anchorTime != null ? indexAtOrBefore(points, zoom.anchorTime, (p) => p.time) : points.length - 1;
            const half = zoom.bars / 2;
            ts.setVisibleLogicalRange({ from: idx - half - LEFT_MARGIN_BARS, to: idx + half });
        } else {
            // 세션 기본 뷰 — 개장 -10분 좌단 ~ 15:30 우단(시간외 ~20:00 는 뷰 밖·데이터 보존).
            // 프리마켓(첫 봉<09:00) 있으면 좌단 07:50(개장 08:00 -10분), 없으면 KRX 전용 → 08:50.
            const openMin = firstMin < REGULAR_OPEN_MIN ? PREMARKET_OPEN_MIN : REGULAR_OPEN_MIN;
            const from = Math.min(0, openMin - LEFT_MARGIN_BARS - firstMin); // clock 좌단 → 첫 봉 기준 논리 인덱스
            let to = points.length - 1;
            for (let i = 0; i < points.length; i++) { if (points[i].tradeTime <= SESSION_CLOSE) to = i; else break; }
            ts.setVisibleLogicalRange({ from, to: to + RIGHT_MARGIN_BARS });
        }
        bumpOverlay();
        // cleanup: 다음 데이터 swap(setData) 이전에 현재 범위+첫봉시각 캡처 → 고정 복원 원본(우측끝 스냅 방지).
        // React 는 "모든 cleanup → 모든 effect" 순이라 이 캡처가 useMinuteSeriesData 의 setData 보다 먼저 돈다.
        return () => {
            try {
                const r = chartRef.current?.timeScale().getVisibleLogicalRange();
                if (r) lockedRef.current = { from: r.from, to: r.to, firstMin };
            } catch { /* chart 파괴됨 */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameKey, zoomSig]);
}
