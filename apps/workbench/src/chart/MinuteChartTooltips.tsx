// 분봉 차트 툴팁 내용물 — 크로스헤어 OHLC 툴팁 + 타점 정보 박스.
// 위치/박스 크롬은 공용 tooltip.tsx, 여기선 분봉 전용 내용만.
import { kstHHmm } from "./chartUtils.js";
import { rateColor } from "./tooltip.js";
import { fmtRate, fmtEok } from "../lib/format.js";
import type { MinutePoint } from "../lib/derive.js";
import { PlacementBadge } from "../components/Placement.js";
import { TagChips } from "../components/TagChips.js";
import type { Tag } from "../api/tags.js";
import { CHART_LABEL, CHART_VALUE } from "../styles/palette.js";

/**
 * 타점 정보 카드 — 세로선 우측에 뜨는 밝은 카드. 현재 타점 마커·저장 타점 hover 공용.
 * 담백 readout 한 줄("09:58 | +8.7% | 57억") + 배치 배지(n/m), 태그가 있으면 아랫줄에 칩.
 * 태그 줄은 **wrap 하지 않고 잘린다** — 차트 위 오버레이라 스크롤할 수 없고, 높이가 데이터에 따라
 * 들쭉날쭉하면 캔들을 가린다. 전부 보려면 "타점 정보" 도킹 패널이 그 자리다(축별 상세도 거기).
 */
export function MarkerCard({
    point,
    axisTotal = 0,
    placed = 0,
    tags = [],
}: {
    point: MinutePoint;
    axisTotal?: number; // 축 총수(0 = 배치 기능 미사용 → 배지 없음)
    placed?: number;
    tags?: Tag[]; // 이 타점에 붙은 태그(없으면 줄 자체가 없음)
}): JSX.Element {
    const sep = <span style={{ color: "rgba(0,0,0,0.2)" }}>|</span>;
    return (
        <div
            style={{
                display: "inline-block",
                maxWidth: 260,
                background: "rgba(255,255,255,0.95)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 4,
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                overflow: "hidden",
            }}
        >
            {/* 헤더 readout 한 줄 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "1px 7px", fontWeight: 600, whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--text-secondary)" }}>{kstHHmm(point.time)}</span>
                {sep}
                <span style={{ color: rateColor(point.close) }}>{fmtRate(point.close)}</span>
                {sep}
                <span style={{ color: "var(--text-secondary)" }}>{fmtEok(point.amount)}</span>
                {axisTotal > 0 && <PlacementBadge placed={placed} total={axisTotal} style={{ marginLeft: 2 }} />}
            </div>
            {tags.length > 0 && (
                <div style={{ padding: "0 7px 2px" }}>
                    <TagChips tags={tags} />
                </div>
            )}
        </div>
    );
}

export function OhlcTooltip({
    time,
    open,
    high,
    low,
    close,
    amount,
    cumAmount,
}: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    amount: number;
    cumAmount: number;
}): JSX.Element {
    const swing = close >= open ? high - low : -(high - low);
    const cell = (label: string, value: number) => (
        <>
            <div style={{ color: CHART_LABEL }}>{label}</div>
            <div style={{ textAlign: "right", color: rateColor(value), fontVariantNumeric: "tabular-nums" }}>
                {fmtRate(value)}
            </div>
        </>
    );
    return (
        <>
            <div style={{ fontSize: 11, color: CHART_LABEL, marginBottom: 6 }}>{kstHHmm(time)}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 14px", fontSize: 11, fontWeight: 600 }}>
                {cell("현재", close)}
                {cell("고가", high)}
                {cell("저가", low)}
                {cell("변동폭", swing)}
                <div style={{ color: CHART_LABEL }}>거래대금</div>
                <div style={{ textAlign: "right", color: CHART_VALUE, fontVariantNumeric: "tabular-nums" }}>{fmtEok(amount)}</div>
                <div style={{ color: CHART_LABEL }}>누적</div>
                <div style={{ textAlign: "right", color: CHART_VALUE, fontVariantNumeric: "tabular-nums" }}>{fmtEok(cumAmount)}</div>
            </div>
        </>
    );
}
