// 시뮬 분포 한 줄 — 값 배열을 히스토그램(로그 높이)으로. 레일 분포 스트립(railHistogram)의 조각 재사용.
// ToleranceRail 에서 스트립을 추출하지 않는 이유: 저긴 T 핸들 대수와 엉켜 있어 복제가 더 싸다(planner).
import { useMemo } from "react";
import { histogramOf, logHeight } from "../filter/rail/railHistogram.js";

const H = 34;
const W = 480;
const BINS = 60;

export function SimDistribution({ label, color, values, count, note, title }: {
    label: string;
    color: string;
    /** 분포 값(%, 부호 그대로) — 도메인은 데이터에서 잡는다. */
    values: readonly number[];
    /** 라벨 옆 건수(분포 모수). */
    count: number;
    /** 라벨 아래 한 줄(중앙값 등). */
    note?: string;
    title?: string;
}): JSX.Element {
    const { bins, max, lo, hi } = useMemo(() => {
        if (values.length === 0) return { bins: [], max: 0, lo: 0, hi: 0 };
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of values) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        if (hi === lo) hi = lo + 1; // 한 값뿐 — 폭 0 나눗셈 방지(한 칸에 다 선다)
        const h = histogramOf(values.map((v) => (v - lo) / (hi - lo)), undefined, BINS);
        return { bins: h.bins, max: h.max, lo, hi };
    }, [values]);
    return (
        <div title={title} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderTop: "1px solid var(--border-subtle)" }}>
            <div style={{ width: 108, flexShrink: 0, fontSize: 11 }}>
                <div style={{ color, fontWeight: 600 }} className="tabular">
                    {label} <span style={{ fontWeight: 400 }}>{count.toLocaleString()}</span>
                </div>
                {note !== undefined && <div style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{note}</div>}
            </div>
            {values.length === 0 ? (
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>값 없음</div>
            ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
                        {bins.map((b, i) =>
                            b.count === 0 ? null : (
                                <rect
                                    key={i}
                                    x={(i / BINS) * W}
                                    width={(W / BINS) * 0.85}
                                    y={H - logHeight(b.count, max) * H}
                                    height={logHeight(b.count, max) * H}
                                    fill={color}
                                    opacity={0.85}
                                />
                            ),
                        )}
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)" }} className="tabular">
                        <span>{lo.toFixed(1)}%</span>
                        <span>{hi.toFixed(1)}%</span>
                    </div>
                </div>
            )}
        </div>
    );
}

/** 중앙값 — note 표기용(패널이 계산해 넘긴다). 빈 배열은 null. */
export function medianOf(values: readonly number[]): number | null {
    if (values.length === 0) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
