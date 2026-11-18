// 분봉 시각선 정보 — 시각선 봉의 값을 분봉 차트 **왼쪽 위 고정 자리**에 테두리·바탕 없이 두 줄로 적는다.
//   C 종가 · H 고가 · H-L (그 봉 고가 − 저가, 양봉 + / 음봉 −) — 당일 %, 부호별 색(빨강·파랑)
//   대금(그 분봉) · 누적(그 시각까지)
// 시각은 시간축 라벨(vertLine)이 말한다. 맨 위 칩 띠(◀ 칩 자리 포함) 바로 아래에서 시작한다 — 바탕이 없으니 글자에 바탕색
// 번짐 테두리를 둘러 캔들 위에서도 읽힌다. 읽는 것이라 누름을 받지 않는다.
import { fmtEok, fmtRate } from "../lib/format.js";
import { rateColor } from "./tooltip.js";
import { CHART_LABEL } from "./palette.js";
import { CHIP_BAND_PX } from "./lineMarks.js";

/** 시각선 봉의 값 — 가격은 당일 %(축이 「가격」이어도), 대금은 원. */
export interface TimeLineInfoValue {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    /** 그 분봉 거래대금(원). */
    amount: number;
    /** 그 시각까지 누적 거래대금(원). */
    cumAmount: number;
    /** 그날 기준가(전일 종가)를 못 구해 첫 시가 기준 % 인가(상장일 등) — 칸에 그렇다고 적는다. */
    baseFallback?: boolean;
}

/** H-L — 그 봉의 고가 − 저가, 양봉(종가 ≥ 시가)이면 +, 음봉이면 −(분봉 툴팁의 변동폭과 같은 값). */
export function barSwing(v: Pick<TimeLineInfoValue, "open" | "high" | "low" | "close">): number {
    const range = v.high - v.low;
    return v.close >= v.open ? range : -range;
}

/** 바탕 없는 글자를 캔들 위에서 읽히게 — 바탕색 번짐 테두리. */
const HALO = "0 0 2px var(--surface), 0 0 2px var(--surface), 0 0 3px var(--surface)";

export function TimeLineInfo({ value }: { value: TimeLineInfoValue | null }): JSX.Element | null {
    if (!value) return null;
    const item = (label: string, text: string, color: string) => (
        <span>
            <span style={{ color: CHART_LABEL, marginRight: 3 }}>{label}</span>
            <span style={{ color }}>{text}</span>
        </span>
    );
    const rate = (label: string, v: number) => item(label, fmtRate(v), rateColor(v));
    return (
        <div
            data-time-line-info=""
            className="tabular"
            style={{
                position: "absolute", top: CHIP_BAND_PX, left: 8, zIndex: 3, pointerEvents: "none",
                display: "flex", flexDirection: "column", gap: 1, whiteSpace: "nowrap",
                fontSize: 11, fontWeight: 600, lineHeight: "16px", textShadow: HALO,
            }}
        >
            <div style={{ display: "flex", gap: 10 }}>
                {rate("C", value.close)}
                {rate("H", value.high)}
                {rate("H-L", barSwing(value))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
                {item("대금", fmtEok(value.amount), "var(--text-secondary)")}
                {item("누적", fmtEok(value.cumAmount), "var(--text-secondary)")}
                {value.baseFallback === true && <span style={{ color: "var(--warning)", fontWeight: 400 }}>첫 시가 기준</span>}
            </div>
        </div>
    );
}
