// 분봉 시각선 꼭대기 정보 칸 — 그 봉의 고가·종가 등락률(당일 %)과 분봉 거래대금. 시각은 시간축 라벨이 말한다(vertLine).
// 캔들 pane 맨 위, 선 오른쪽에 붙고 오른쪽 끝에 닿으면 왼쪽으로 넘긴다. 분봉 선 칩(LineMarkLayer)과 같은 띠라 그 위에
// 바탕색 상자로 그린다 — 시각선이 그 자리에 있는 동안만 칩이 가려지고, 칩에 마우스를 올리면(behind) 칩 뒤로 물러난다.
// 읽는 것이라 누름을 받지 않는다(가려진 칩에도 마우스가 닿는다).
// 자리는 칩 층과 같은 수법으로 잰다 — 가로 범위·크기가 바뀔 때 rAF 하나로.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { IChartApi, Time } from "lightweight-charts";
import { fmtEok, fmtRate } from "../lib/format.js";
import { rateColor } from "./tooltip.js";
import { CHART_LABEL } from "./palette.js";

/** 시각선 봉의 값 — high·close 는 당일 %(축이 「가격」이어도), amount 는 그 분봉 거래대금(원). */
export interface TimeLineInfoValue {
    time: number;
    high: number;
    close: number;
    amount: number;
    /** 그날 기준가(전일 종가)를 못 구해 첫 시가 기준 % 인가(상장일 등) — 칸에 그렇다고 적는다. */
    baseFallback?: boolean;
}

const TOP = 4;
const GAP = 4;

/** 정보 칸의 왼쪽 자리 — 선 오른쪽에 붙이되 넘치면 선 왼쪽으로. 폭을 아직 모르면(0) 오른쪽. */
export function infoBoxLeft(x: number, boxW: number, paneW: number): number {
    const right = x + GAP;
    return right + boxW <= paneW || x - GAP - boxW < 0 ? right : x - GAP - boxW;
}

export function TimeLineInfo({ chartRef, value, gen, behind = false }: {
    chartRef: RefObject<IChartApi | null>;
    value: TimeLineInfoValue | null;
    gen: number;
    /** 칩에 마우스가 올라가 있다 — 칩 층(4) 뒤로 물러난다. */
    behind?: boolean;
}): JSX.Element | null {
    const [place, setPlace] = useState<{ x: number; w: number } | null>(null);
    const time = value?.time ?? null;
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || time === null) {
            setPlace(null);
            return;
        }
        let raf: number | null = null;
        const measure = (): void => {
            raf = null;
            const ts = chart.timeScale();
            const x = ts.timeToCoordinate(time as Time);
            const w = ts.width();
            setPlace(x !== null && x >= 0 && x <= w ? { x: x as number, w } : null);
        };
        const schedule = (): void => {
            if (raf === null) raf = requestAnimationFrame(measure);
        };
        schedule();
        chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
        chart.timeScale().subscribeSizeChange(schedule);
        return () => {
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);
            chart.timeScale().unsubscribeSizeChange(schedule);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, [chartRef, time, gen]);

    const boxRef = useRef<HTMLDivElement>(null);
    const [boxW, setBoxW] = useState(0);
    useLayoutEffect(() => {
        const w = boxRef.current?.offsetWidth ?? 0;
        if (w !== boxW) setBoxW(w);
    });

    if (!value || !place) return null;
    const rate = (label: string, v: number) => (
        <span>
            <span style={{ color: CHART_LABEL, marginRight: 3 }}>{label}</span>
            <span style={{ color: rateColor(v) }}>{fmtRate(v)}</span>
        </span>
    );
    return (
        <div
            ref={boxRef}
            data-time-line-info=""
            className="tabular"
            style={{
                position: "absolute", top: TOP, left: infoBoxLeft(place.x, boxW, place.w), zIndex: behind ? 3 : 5, pointerEvents: "none", // 칩 층(4) 위 · 칩 설명 카드(6) 아래, 칩 hover 동안은 칩 뒤
                display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap",
                padding: "2px 6px", fontSize: 11, fontWeight: 600, lineHeight: "16px",
                background: "var(--surface)", border: "1px solid rgba(37,99,235,0.35)", borderRadius: 3,
            }}
        >
            {rate("H", value.high)}
            {rate("C", value.close)}
            <span style={{ color: "var(--text-secondary)" }}>{fmtEok(value.amount)}</span>
            {value.baseFallback === true && <span style={{ color: "var(--warning)", fontWeight: 400 }}>첫 시가 기준</span>}
        </div>
    );
}
