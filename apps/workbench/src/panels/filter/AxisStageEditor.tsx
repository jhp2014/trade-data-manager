// 축 조건 편집 — 판단 축은 **수평선 위 자리 두 개**로 밴드, 계산 축은 값 구간.
//
// 배치 보드 레인을 축소 복제하지 않는다 — 필터에 필요한 건 "경계 두 자리"뿐이라, 자리(slot)를 점으로
// 늘어놓은 선 하나면 충분하다(레인은 배치가 본업이라 드래그·팝오버·프로파일까지 담는다). 관례는 레인과
// 같다: **오른쪽 = 강함**(큰 orderKey · rank 1).
//
// 경계는 slot 앵커다(값이 아니라 "그 자리") — 재배치로 자리가 사라지면 밴드가 깨진 것이고, 그건
// 판정(evaluate)이 모름으로 처리한다. 하나만 찍으면 반열림(거기서 한쪽 끝까지).
import { useMemo, useState } from "react";
import { AnchoredPopover, MenuLabel } from "../../ui/Dialog.js";
import { useRankAxes } from "../../lib/useRankAxes.js";
import { isComputedAxis, valueDomain } from "../../lib/computedAxis.js";
import type { AxisValueRange, RankBand } from "../../store/rankFilterSlice.js";
import { FILTER } from "../../styles/palette.js";
import type { FilterPredicate, Grain } from "./stage.js";

type AxisPredicate = Extract<FilterPredicate, { kind: "axisBand" } | { kind: "axisValue" }>;

export function AxisStageEditor({ anchor, scope, initial, onCommit, onClose }: {
    anchor: { x: number; y: number };
    /** 이 단계가 사는 칸의 층위 — 축 목록을 이 층위로 좁힌다(칸이 곧 선언). */
    scope: Grain;
    initial?: AxisPredicate;
    onCommit: (p: FilterPredicate) => void;
    onClose: () => void;
}): JSX.Element {
    const { axes, linesByAxis, computedValues, computedMeta } = useRankAxes({ includeComputed: true });
    const [axisId, setAxisId] = useState<string | null>(initial?.axisId ?? null);
    const [band, setBand] = useState<RankBand>(initial?.kind === "axisBand" ? initial.band : {});
    const [rows, setRows] = useState<{ from: string; to: string }[]>(
        initial?.kind === "axisValue"
            ? initial.ranges.map((r) => ({
                from: r.from?.kind === "value" ? String(r.from.value) : "",
                to: r.to?.kind === "value" ? String(r.to.value) : "",
            }))
            : [{ from: "", to: "" }],
    );

    const candidates = useMemo(() => axes.filter((a) => a.scope === scope), [axes, scope]);
    const computed = axisId !== null && isComputedAxis(axisId);
    const line = axisId ? (linesByAxis.get(axisId) ?? []) : [];

    const commit = (): void => {
        if (!axisId) return;
        if (computed) {
            const ranges: AxisValueRange[] = [];
            for (const r of rows) {
                const from = Number(r.from), to = Number(r.to);
                const hasFrom = r.from.trim() !== "" && Number.isFinite(from);
                const hasTo = r.to.trim() !== "" && Number.isFinite(to);
                if (!hasFrom && !hasTo) continue;
                ranges.push({
                    ...(hasFrom ? { from: { kind: "value", value: from } } : {}),
                    ...(hasTo ? { to: { kind: "value", value: to } } : {}),
                });
            }
            onCommit({ kind: "axisValue", axisId, ranges });
        } else {
            onCommit({ kind: "axisBand", axisId, band });
        }
        onClose();
    };
    const canCommit = axisId !== null && (computed
        ? rows.some((r) => r.from.trim() !== "" || r.to.trim() !== "")
        : band.lo !== undefined || band.hi !== undefined);

    const fmt = axisId ? computedMeta.get(axisId)?.fmt : undefined;
    const domain = computed && axisId ? valueDomain(computedValues.get(axisId) ?? new Map()) : null;

    return (
        <AnchoredPopover anchor={anchor} onClose={onClose} minWidth={280} maxWidth={340} maxHeight="min(60vh, 440px)" padding={0} placement="beside" offset={8}>
            <MenuLabel>축 조건 · {scope === "day" ? "하루" : "타점"} 층위</MenuLabel>

            <div style={{ padding: "0 10px 8px" }}>
                <select value={axisId ?? ""} onChange={(e) => { setAxisId(e.target.value || null); setBand({}); }} style={{ width: "100%", fontSize: 12 }}>
                    <option value="">축 고르기…</option>
                    {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}{isComputedAxis(a.id) ? " (계산)" : ""}</option>)}
                </select>
                {candidates.length === 0 && <div style={{ paddingTop: 6, fontSize: 11, color: "var(--text-tertiary)" }}>이 층위에 축이 없습니다</div>}
            </div>

            {axisId && !computed && (
                line.length === 0
                    ? <div style={{ padding: "0 10px 10px", fontSize: 11, color: "var(--text-tertiary)" }}>이 축엔 아직 배치가 없습니다 — 경계로 삼을 자리가 없어요.</div>
                    : <SlotLine line={line} band={band} onBand={setBand} />
            )}

            {axisId && computed && (
                <div style={{ padding: "0 10px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                    {domain && fmt && (
                        <div style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>값 범위 {fmt(domain.min)} ~ {fmt(domain.max)} · 비운 쪽 = 끝까지</div>
                    )}
                    {rows.map((r, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <input value={r.from} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} placeholder="이상" style={numStyle} />
                            <span style={{ color: "var(--text-tertiary)" }}>~</span>
                            <input value={r.to} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} placeholder="이하" style={numStyle} />
                            <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length <= 1} title="이 구간 제거" style={xBtn}>✕</button>
                        </div>
                    ))}
                    <button onClick={() => setRows((rs) => [...rs, { from: "", to: "" }])} style={{ ...dashedBtn, alignSelf: "flex-start" }}>+ 구간(또는)</button>
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "6px 10px 9px", borderTop: "1px solid var(--border-subtle)" }}>
                <button onClick={onClose} style={dashedBtn}>취소</button>
                <button onClick={commit} disabled={!canCommit} style={{ ...dashedBtn, color: canCommit ? "var(--accent-primary)" : "var(--text-tertiary)", borderColor: canCommit ? "var(--accent-primary)" : undefined }}>적용</button>
            </div>
        </AnchoredPopover>
    );
}

interface SlotView { slotId: string; orderKey: number; count: number; frac: number; rank: number }

/** 자리 수평선 — 점 클릭이 빈 경계를 채운다(둘 다 차면 처음부터). 각 경계는 ✕ 로 따로 풀린다. */
function SlotLine({ line, band, onBand }: {
    line: { slotId: string; orderKey: number }[];
    band: RankBand;
    onBand: (b: RankBand) => void;
}): JSX.Element {
    const slots = useMemo<SlotView[]>(() => {
        const by = new Map<number, { slotId: string; count: number }>();
        for (const p of line) {
            const e = by.get(p.orderKey);
            if (e) e.count++;
            else by.set(p.orderKey, { slotId: p.slotId, count: 1 });
        }
        const asc = [...by.entries()].sort((a, b) => a[0] - b[0]);
        return asc.map(([orderKey, e], i) => ({
            ...e, orderKey,
            frac: asc.length <= 1 ? 0.5 : i / (asc.length - 1),
            rank: asc.length - i, // 오른쪽(큰 orderKey) = 강함 = rank 1 — 레인·시트와 같은 관례
        }));
    }, [line]);

    const keyOf = (slotId: string | undefined): number | undefined => slots.find((s) => s.slotId === slotId)?.orderKey;
    const loK = keyOf(band.lo);
    const hiK = keyOf(band.hi);
    // 강조 구간 — 둘이면 사이, 하나면 반열림(lo=거기서 위로 / hi=거기서 아래로). evaluate 의 정규화와 같은 뜻.
    const inBand = (ok: number): boolean => {
        if (loK !== undefined && hiK !== undefined) return ok >= Math.min(loK, hiK) && ok <= Math.max(loK, hiK);
        if (loK !== undefined) return ok >= loK;
        if (hiK !== undefined) return ok <= hiK;
        return false;
    };
    const pick = (slotId: string): void => {
        if (band.lo === undefined) onBand({ ...band, lo: slotId });
        else if (band.hi === undefined && band.lo !== slotId) onBand({ ...band, hi: slotId });
        else onBand({ lo: slotId }); // 둘 다 찼으면(또는 같은 자리 재클릭) 처음부터
    };
    const chip = (label: string, slotId: string | undefined, clear: () => void): JSX.Element => {
        const s = slots.find((x) => x.slotId === slotId);
        return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: s ? FILTER : "var(--text-tertiary)" }}>
                {label} {s ? `${s.rank}위` : "—"}
                {s && <button onClick={clear} title="이 경계 풀기(반열림)" style={xBtn}>✕</button>}
            </span>
        );
    };

    return (
        <div style={{ padding: "0 10px 8px" }}>
            <div style={{ position: "relative", height: 40, margin: "2px 8px 0" }}>
                <div style={{ position: "absolute", left: 0, right: 0, top: 19, height: 2, background: "var(--border-strong)" }} />
                {slots.map((s) => {
                    const on = inBand(s.orderKey);
                    const isBound = s.slotId === band.lo || s.slotId === band.hi;
                    return (
                        <button key={s.slotId} onClick={() => pick(s.slotId)}
                            title={`${s.rank}위 · ${s.count}개 — 클릭 = 경계`}
                            style={{
                                position: "absolute", left: `${s.frac * 100}%`, top: 20, transform: "translate(-50%,-50%)",
                                width: isBound ? 13 : 9, height: isBound ? 13 : 9, borderRadius: "50%", padding: 0, cursor: "pointer",
                                border: `2px solid ${on ? FILTER : "var(--border-strong)"}`,
                                background: isBound ? FILTER : on ? `${FILTER}55` : "var(--bg-primary)",
                            }} />
                    );
                })}
                <span style={{ position: "absolute", left: 0, bottom: -2, fontSize: 9.5, color: "var(--text-tertiary)" }}>약</span>
                <span style={{ position: "absolute", right: 0, bottom: -2, fontSize: 9.5, color: "var(--text-tertiary)" }}>강</span>
            </div>
            <div style={{ display: "flex", gap: 12, paddingTop: 6 }}>
                {chip("경계1", band.lo, () => onBand({ hi: band.hi }))}
                {chip("경계2", band.hi, () => onBand({ lo: band.lo }))}
                <span style={{ fontSize: 10.5, color: "var(--text-tertiary)" }}>하나만 = 반열림</span>
            </div>
        </div>
    );
}

const numStyle: React.CSSProperties = {
    width: 84, boxSizing: "border-box", border: "1px solid var(--border-default)", borderRadius: 5,
    background: "var(--bg-primary)", color: "var(--text-primary)", padding: "3px 6px", fontSize: 12, outline: "none",
    fontVariantNumeric: "tabular-nums",
};
const dashedBtn: React.CSSProperties = {
    fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)",
    background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
};
const xBtn: React.CSSProperties = {
    border: "none", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer",
    fontSize: 10, lineHeight: 1, padding: "0 2px",
};
