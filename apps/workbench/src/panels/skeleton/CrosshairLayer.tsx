// 크로스헤어 — 마우스 위치의 (시간, %) 읽기 + 세로선 판독 칩.
//
// 상태(마우스 좌표)를 여기 가둬 부모(선 수백 개)가 이동마다 안 그려지게 한다 — 부모 렌더에
// mousemove 를 태우면 선 전부가 이동마다 재조정된다(패널에서 분리해 둔 이유이자, 파일로도 가른 이유).
import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { RISE_COLOR, FALL_COLOR } from "../../chart/chartUtils.js";
import { labelDot } from "./chips.js";
import { READOUT_OFFSET, readoutBox } from "./PinLayer.js";
import { layoutReadoutRows, READOUT_GAP, type ReadoutCandidate } from "./readout.js";
import { ACTIVE } from "../../styles/palette.js";
import { fmtEok, fmtPct } from "../../lib/format.js";
import { timeOfMinutes } from "../../lib/date.js";

/** 이 층이 쓰는 스케일 — d3 ScaleLinear 의 구조적 부분집합(패널의 Scales 가 그대로 들어온다). */
interface Scales {
    x: { (v: number): number; invert: (px: number) => number };
    y: { (v: number): number; invert: (px: number) => number };
}

export function CrosshairLayer({ wrapRef, scales, box, fmtX, abs, readoutAt, colorOf }: {
    wrapRef: RefObject<HTMLDivElement | null>;
    scales: Scales;
    box: { left: number; top: number; width: number; height: number };
    /** x 값 표기(단위 적용된 것) — 일봉 "N일" / 분봉 "N분". */
    fmtX: (v: number) => string;
    /** 선택된 타점의 원점 — 있으면 뱃지가 절대값(벽시계·전일比 %)을 괄호로 같이 읽는다. */
    abs: { baseT: number; baseRate: number } | null;
    /** 세로선 판독기(부모가 만든다) — 커서 x 를 넣으면 그 시각에 보여줄 선들의 값. null 이면 안 펼친다. */
    readoutAt: ((x: number) => ReadoutCandidate[]) | null;
    colorOf: (code: string) => string;
}): JSX.Element | null {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const move = (e: MouseEvent): void => {
            const r = el.getBoundingClientRect();
            setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
        };
        const leave = (): void => setPos(null);
        el.addEventListener("mousemove", move);
        el.addEventListener("mouseleave", leave);
        return () => {
            el.removeEventListener("mousemove", move);
            el.removeEventListener("mouseleave", leave);
        };
    }, [wrapRef]);

    if (!pos || pos.x < box.left || pos.x > box.left + box.width || pos.y < box.top || pos.y > box.top + box.height) return null;
    const xv = scales.x.invert(pos.x);
    const yv = scales.y.invert(pos.y);
    // 판독은 **선 위의 값**이라 커서 y 와 무관하다 — 세로선이 곧 자(尺)다.
    const rows = readoutAt ? layoutReadoutRows(
        readoutAt(xv).map((r) => ({ item: r, y: scales.y(r.y) })),
        { min: box.top + 8, max: box.top + box.height - 8 },
        READOUT_GAP,
    ) : [];
    // 오른쪽 끝에 닿으면 왼쪽으로 넘긴다 — 잘려서 못 읽는 것보단 잠깐 궤적을 가리는 게 낫다.
    const flip = pos.x > box.left + box.width - (READOUT_OFFSET + 140);
    const chipX = pos.x + (flip ? -READOUT_OFFSET : READOUT_OFFSET);
    // 읽기값은 커서 옆이 아니라 **축 가장자리 뱃지**(사용자 확정) — 차트 보던 습관 그대로 축에서 읽는다.
    return (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {/* 점선 헤어라인 — 배경 없는 0폭 div 에 dashed border(1px div 배경으로는 점선이 안 된다). */}
            <div style={{ position: "absolute", left: pos.x, top: box.top, width: 0, height: box.height, borderLeft: "1px dashed var(--border-strong)", opacity: 0.8 }} />
            <div style={{ position: "absolute", left: box.left, top: pos.y, height: 0, width: box.width, borderTop: "1px dashed var(--border-strong)", opacity: 0.8 }} />
            {/* y 뱃지 — 왼쪽 % 축 위(눈금 숫자가 서는 자리, 오른끝을 축에 맞춘다). */}
            <div style={{ ...axisBadge, left: box.left - 2, top: pos.y - 7, transform: "translateX(-100%)" }}>
                {fmtPct(yv)}{abs && <span style={axisBadgeAbs}> {fmtPct(yv + abs.baseRate)}</span>}
            </div>
            {/* x 뱃지 — 아래 시간축 위. */}
            <div style={{ ...axisBadge, left: pos.x, bottom: 2, transform: "translateX(-50%)" }}>
                {fmtX(xv)}{abs && <span style={axisBadgeAbs}> {timeOfMinutes(xv + abs.baseT)}</span>}
            </div>
            {/* 세로선 판독 — 지시선(SVG)이 먼저, 칩(HTML)이 그 위에. 칩은 **포인터를 안 받는다**:
                커서 밑에 칩이 깔리면 그게 선의 호버를 가로채 판독이 깜빡인다(떴다 사라졌다 반복). */}
            {rows.length > 0 && (
                <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    {rows.map((r) => (
                        <g key={r.item.code} opacity={r.item.own ? 0.95 : 0.5}>
                            <line x1={pos.x} y1={r.anchorY} x2={chipX} y2={r.labelY}
                                stroke={colorOf(r.item.code)} strokeWidth={0.8} strokeDasharray="2 2" />
                            <circle cx={pos.x} cy={r.anchorY} r={2.2} fill={colorOf(r.item.code)} />
                        </g>
                    ))}
                </svg>
            )}
            {rows.map((r) => (
                <div key={r.item.code} style={{
                    ...readoutBox, left: chipX, top: r.labelY,
                    transform: flip ? "translate(-100%, -50%)" : "translateY(-50%)",
                    borderColor: r.item.own ? ACTIVE : "var(--border-default)",
                    fontWeight: r.item.own ? 500 : 400,
                }}>
                    <span style={labelDot(colorOf(r.item.code))} />
                    <span>{r.item.name}</span>
                    {/* 진짜 값이 화면 밖이라 가장자리로 당겨진 칩 — 어느 쪽에 있는지 남긴다. */}
                    {r.off && <span style={{ color: "var(--text-tertiary)" }}>{r.off === "up" ? "▲" : "▼"}</span>}
                    <span style={{ color: r.item.pct >= 0 ? RISE_COLOR : FALL_COLOR }}>{fmtPct(r.item.pct)}</span>
                    {/* 거래대금은 없을 수 있다(그날 유니버스 밖) — 0으로 지어내지 않고 자리를 비운다. */}
                    {r.item.amount !== null && <span style={{ color: "var(--text-secondary)" }}>{fmtEok(r.item.amount)}</span>}
                </div>
            ))}
        </div>
    );
}

/** 크로스헤어 축 뱃지 — 축 눈금 위에 얹히므로 불투명 배경으로 아래 숫자를 덮는다(겹쳐 보이면 둘 다 못 읽는다). */
const axisBadge: CSSProperties = {
    position: "absolute", fontSize: 9.5, lineHeight: "13px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    color: "var(--text-primary)", background: "var(--bg-tertiary)", border: "1px solid var(--border-default)",
    borderRadius: 3, padding: "0 4px",
};
/** 크로스헤어 뱃지 안의 절대값 — 같은 뱃지에 이어 붙되 색으로 갈린다(뱃지를 둘로 나누면 축이 복잡해진다). */
const axisBadgeAbs: CSSProperties = { color: "var(--text-tertiary)" };
