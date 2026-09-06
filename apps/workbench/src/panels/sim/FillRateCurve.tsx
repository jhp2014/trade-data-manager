// 체결률 곡선 — n→체결률 계단함수(basis 파생, 취소 노브에만 의존)와 현재 타점 n 마커.
// 규칙: decisions.md 「시그널 결과」 트레이드 시뮬 항목.
//
// 곡선의 재료(요구 타점 %)가 n 에 불변이라는 것이 이 그림의 존재 이유다 — n 을 드래그해도 곡선은
// 정지해 있고 세로 마커만 움직여 "여기 두면 몇 % 체결"이 재계산 없이 읽힌다(취소 노브를 만지면
// 그때는 곡선이 움직인다 — 맞는 그림). 마커 드래그 = n 의 두 번째 편집 입구(값의 단일 출처는
// pointDef.sim.entry.pct, 커밋은 손 뗄 때 한 번 — 테마 순위 컷선 드래그 선례).
import { useMemo, useRef, useState } from "react";
import { POINT_DEF } from "../../styles/palette.js";

const H = 56;
const W = 480; // viewBox 폭 — preserveAspectRatio none 이라 실폭에 늘어난다(선만 있고 글자는 HTML 밖)

export function FillRateCurve({ requiredPcts, total, entryPct, onCommit, normalize }: {
    /** 모수(생존 시그널)의 요구 타점 %(결손 제외) — 정렬 불요, 여기서 센다. */
    requiredPcts: readonly number[];
    /** 모수 크기(결손 포함 — 결손 = 어떤 n 에도 미체결). */
    total: number;
    entryPct: number;
    onCommit: (pct: number) => void;
    /** 커밋 전 정규화 — parseTradeSimParams 경유(0 특례·2 올림). 패널이 파서 규칙을 넘긴다. */
    normalize: (v: number) => number;
}): JSX.Element {
    // 드래그 중 시각 초안 — 커밋(전량 재걷기)은 손 뗄 때 한 번.
    const [draft, setDraft] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const sorted = useMemo(() => [...requiredPcts].sort((a, b) => a - b), [requiredPcts]);
    const xMax = useMemo(() => Math.min(30, Math.max(8, Math.ceil((sorted[sorted.length - 1] ?? 0) + 1))), [sorted]);
    /** n → 체결 수(요구 ≥ n). n=0 은 즉시 체결 특례라 전부. */
    const fillCount = (n: number): number => {
        if (n === 0) return total;
        // sorted 에서 n 이상인 첫 색인 — 이분 탐색(모수 수천이라 선형도 되지만 드래그 프레임마다 돈다).
        let loIdx = 0;
        let hiIdx = sorted.length;
        while (loIdx < hiIdx) {
            const mid = (loIdx + hiIdx) >> 1;
            if (sorted[mid] < n) loIdx = mid + 1;
            else hiIdx = mid;
        }
        return sorted.length - loIdx;
    };
    const rateOf = (n: number): number => (total > 0 ? (fillCount(n) / total) * 100 : 0);
    const path = useMemo(() => {
        // 계단을 픽셀 샘플링으로 근사 — breakpoint 수가 수천이라 점 목록보다 싸고 시각 차이는 없다.
        const pts: string[] = [];
        for (let i = 0; i <= 160; i++) {
            const n = (i / 160) * xMax;
            const y = H - 4 - (rateOf(n) / 100) * (H - 10);
            pts.push(`${(i / 160) * W},${y}`);
        }
        return pts.join(" ");
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rateOf 는 sorted/total 파생(둘 다 deps)
    }, [sorted, total, xMax]);

    const shown = draft ?? entryPct;
    const markerX = (Math.min(shown, xMax) / xMax) * W;
    const pctAt = (clientX: number): number => {
        const el = svgRef.current;
        if (!el) return shown;
        const r = el.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
        return Math.round(frac * xMax * 10) / 10;
    };
    return (
        <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                <span style={{ color: POINT_DEF, fontWeight: 600 }}>체결률 곡선</span>
                <span className="tabular">
                    타점 −{shown}% → <b style={{ color: POINT_DEF }}>{total > 0 ? Math.round(rateOf(shown)) : 0}%</b>
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>드래그로 타점 이동 · 곡선은 취소 노브의 함수</span>
            </div>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                style={{ width: "100%", height: H, display: "block", cursor: "col-resize", touchAction: "none" }}
                onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    setDraft(pctAt(e.clientX));
                }}
                onPointerMove={(e) => {
                    if (draft !== null) setDraft(pctAt(e.clientX));
                }}
                onPointerUp={(e) => {
                    if (draft === null) return;
                    onCommit(normalize(pctAt(e.clientX)));
                    setDraft(null);
                }}
            >
                <line x1={0} y1={H - 4} x2={W} y2={H - 4} stroke="var(--border-default)" strokeWidth={1} />
                <polyline points={path} fill="none" stroke={POINT_DEF} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                <line x1={markerX} y1={2} x2={markerX} y2={H - 4} stroke={POINT_DEF} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)" }} className="tabular">
                <span>0%</span>
                <span>−{xMax}%</span>
            </div>
        </div>
    );
}
