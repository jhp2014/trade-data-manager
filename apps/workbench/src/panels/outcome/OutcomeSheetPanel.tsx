// 결과 시트 — 시그널 행 단위로 결과를 나란히 읽는 판(고점@T1/@T2/Δ/낙폭 2종/상태).
// 분포는 결과 패널(레일)이, 개별 확인·Δ 정렬·차트 되짚기는 여기가 진다 — 사용자 확정("데이터가 많아지면
// 계단곡선은 의미가 없다, 디테일은 시트").
//
// 모수 = **보는 집합**(viewOf(null) — 다른 구독 패널과 같은 계약). 아무것도 안 걸렸으면 시그널 전부.
// 가상화 어휘는 앱 공통 한 벌(평탄 배열 + 고정 높이 + @tanstack/react-virtual) — decisions.md
// "워크벤치 목록 렌더링": 계보에 overflow:hidden 금지, 세로 이동은 가상화기 API.
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReviewPointKey } from "@trade-data-manager/market/domain";
import { PanelHeader } from "../../components/ControlChrome.js";
import { useOutcomes, type OutcomeRecord } from "../../lib/PointGridsContext.js";
import { usePointRows } from "../../lib/usePointRows.js";
import { pointKey } from "../../lib/pointKey.js";
import { useStockNames } from "../../lib/useStockNames.js";
import { useSubject } from "../../lib/subject.js";
import { useWorkbench } from "../../store/workbench.js";
import { LEG_HIGH } from "../../styles/palette.js";
import { useFunnel } from "../filter/FunnelContext.js";
import { Note } from "../filter/grain.js";

const ROW_H = 22;

type SortKey = "delta" | "ext" | "time";

interface Row {
    ref: ReviewPointKey;
    key: string;
    /** undefined = 격자 미도착뿐(자동 시그널이 격자 파생이라 실질 도달 희박). 무눌림은 slice.status "none". */
    rec: OutcomeRecord | undefined;
}

const fmtPct = (v: number): string => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

export function OutcomeSheetPanel(): JSX.Element {
    const outcomes = useOutcomes();
    const pts = usePointRows();
    const v = useFunnel();
    const { nameOf } = useStockNames();
    const goToPoint = useWorkbench((s) => s.goToPoint);
    const subject = useSubject();
    const [sortKey, setSortKey] = useState<SortKey>("delta");

    // 보는 집합 — 걸린 게 있으면 그 멤버만, 없으면 시그널 전부(레일 분포와 모수가 갈리므로 머리글에 적는다).
    const selectedView = v.viewOf(null);
    const filtered = selectedView.isFiltering && !selectedView.broken;
    const rows = useMemo<Row[]>(() => {
        const refs: readonly ReviewPointKey[] = filtered
            ? selectedView.viewedPointRefs
            : pts.points;
        const out: Row[] = refs.map((ref) => {
            const key = pointKey(ref);
            return { ref, key, rec: outcomes.byKey.get(key) };
        });
        // 레코드 미도착 행은 항상 맨 뒤(안 떨구되 본론을 가리지 않게), 그 앞은 정렬 키 내림차순.
        const val = (r: Row): number => {
            if (!r.rec) return -Infinity;
            if (sortKey === "delta") return r.rec.eval.deltaExt ?? -Infinity;
            if (sortKey === "ext") return r.rec.slice.extPct; // 기본(T1) 연장 고점
            return 0; // time — 행 원천(날짜 내림차순·시각 오름차순) 순서 유지
        };
        if (sortKey !== "time") out.sort((a, b) => val(b) - val(a));
        else out.sort((a, b) => (a.rec === undefined ? 1 : 0) - (b.rec === undefined ? 1 : 0));
        return out;
    }, [filtered, selectedView, pts.points, outcomes, sortKey]);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_H,
        overscan: 20,
    });

    const sortBtn = (key: SortKey, label: string, title: string): JSX.Element => (
        <button onClick={() => setSortKey(key)} title={title}
            style={{
                border: "none", background: "transparent", cursor: "pointer", font: "inherit", padding: 0,
                color: sortKey === key ? "var(--accent-primary)" : "var(--text-secondary)",
                fontWeight: sortKey === key ? 700 : 400,
            }}>
            {label}{sortKey === key ? "↓" : ""}
        </button>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg-primary)", fontSize: 11.5, color: "var(--text-primary)" }}>
            <PanelHeader padding="5px 10px" style={{ whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }}>결과 시트</span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", flexShrink: 0 }} className="tabular">
                    {rows.length.toLocaleString()}행{filtered ? " (보는 집합)" : " (시그널 전부)"}
                </span>
                <span style={{ fontSize: 10, color: LEG_HIGH, flexShrink: 0 }} className="tabular">T {outcomes.t1}→{outcomes.t2}%</span>
            </PanelHeader>

            {/* 헤더도 같은 스크롤 상자 안 sticky — 밖으로 빼면 가로 스크롤이 갈려 고정 열이 죽는다(decisions). */}
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <div style={{ minWidth: 560 }}>
                    <div style={{
                        position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", height: ROW_H,
                        background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-default)", fontSize: 10.5, color: "var(--text-secondary)",
                    }}>
                        <span style={{ ...CELL, width: 110, textAlign: "left" }}>{sortBtn("time", "종목", "행 원천 순서(날짜 내림차순·시각 오름차순)")}</span>
                        <span style={{ ...CELL, width: 44 }}>시각</span>
                        <span style={{ ...CELL, width: 62 }}>{sortBtn("ext", "고점@T1", "기본 허용 T1 의 연장 고점 %(Point 종가 대비)로 정렬 — 술어·차트 표식과 같은 기준")}</span>
                        <span style={{ ...CELL, width: 62 }}>고점@T2</span>
                        <span style={{ ...CELL, width: 56 }}>{sortBtn("delta", "Δ", "Δ 연장폭(T1→T2)으로 정렬")}</span>
                        <span style={{ ...CELL, width: 66 }}>저가·고점比</span>
                        <span style={{ ...CELL, width: 66 }}>저가·종가比</span>
                        <span style={{ ...CELL, width: 40, textAlign: "center" }} title="보고 저가 이후 직전 고가 재돌파 여부(세션 최고가 판정)">회복</span>
                        <span style={{ ...CELL, width: 52 }}>상태</span>
                    </div>
                    {rows.length === 0 && <Note>표시할 시그널이 없습니다</Note>}
                    <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
                        {virtualizer.getVirtualItems().map((vi) => {
                            const row = rows[vi.index]!;
                            const focused = subject !== null && subject.time !== null
                                && subject.code === row.ref.stockCode && subject.date === row.ref.date
                                && subject.time === row.ref.time;
                            return (
                                <div key={row.key} className="sheet-row" {...(focused ? { "data-focus": true } : {})}
                                    onClick={() => goToPoint({ date: row.ref.date, code: row.ref.stockCode, time: row.ref.time }, "outcome-sheet")}
                                    title={`${nameOf(row.ref.stockCode)} ${row.ref.date} ${row.ref.time.slice(0, 5)} — 클릭하면 차트가 이 시그널로 갑니다`}
                                    style={{
                                        position: "absolute", top: 0, left: 0, right: 0, height: ROW_H,
                                        transform: `translateY(${vi.start}px)`, display: "flex", alignItems: "center",
                                        cursor: "pointer", borderBottom: "1px solid var(--border-subtle)",
                                    }}>
                                    <RowCells row={row} nameOf={nameOf} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

const CELL: React.CSSProperties = { display: "inline-block", flexShrink: 0, padding: "0 6px", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

function RowCells({ row, nameOf }: { row: Row; nameOf: (code: string) => string }): JSX.Element {
    const rec = row.rec;
    const num = (v: number | undefined, opts?: { plusRed?: boolean; suffix?: string }): JSX.Element => (
        <span className="tabular" style={{ color: v === undefined ? "var(--text-tertiary)" : opts?.plusRed && v > 0 ? "var(--rise)" : v !== undefined && v < 0 ? "var(--fall)" : "var(--text-primary)" }}>
            {v === undefined ? "—" : `${fmtPct(v)}${opts?.suffix ?? ""}`}
        </span>
    );
    const delta = rec?.eval.deltaExt;
    const recovered = rec?.slice.recovered;
    return (
        <>
            <span style={{ ...CELL, width: 110, textAlign: "left" }}>
                {nameOf(row.ref.stockCode)} <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{row.ref.date.slice(5)}</span>
            </span>
            <span style={{ ...CELL, width: 44, color: "var(--text-tertiary)" }} className="tabular">{row.ref.time.slice(0, 5)}</span>
            <span style={{ ...CELL, width: 62 }}>{num(rec?.slice.extPct, { plusRed: true })}</span>
            <span style={{ ...CELL, width: 62 }}>{num(rec?.sliceT2.extPct, { plusRed: true })}</span>
            <span style={{ ...CELL, width: 56, background: delta !== undefined && delta > 0 ? "var(--warning-soft)" : undefined }}>
                {num(delta, { plusRed: true })}
            </span>
            <span style={{ ...CELL, width: 66 }}>{num(rec?.slice.dropFromHighPct ?? undefined)}</span>
            <span style={{ ...CELL, width: 66 }}>{num(rec?.slice.dropFromClosePct ?? undefined)}</span>
            <span style={{ ...CELL, width: 40, textAlign: "center", color: recovered === true ? "var(--rise)" : recovered === false ? "var(--fall)" : "var(--text-tertiary)" }}>
                {recovered === true ? "○" : recovered === false ? "✕" : "—"}
            </span>
            <span style={{ ...CELL, width: 52, textAlign: "center" }}>
                {rec === undefined
                    ? <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    : rec.slice.status === "exceeded"
                        ? <span title="T1 보다 깊은 눌림 발생 — 저가 = T1 을 처음 넘은 눌림" style={{ color: "var(--text-secondary)" }}>초과</span>
                        : rec.slice.status === "contained"
                            ? <span title="눌림은 있었으나 전부 T1 이내 — 연장 고점 = 세션 최고가, 저가 = T1 이내 최대 눌림" style={{ color: LEG_HIGH, border: `1px solid ${LEG_HIGH}`, borderRadius: 3, padding: "0 3px", fontSize: 10 }}>이내</span>
                            : <span title="2% 이상 눌림 자체가 없음(상한가 직행 등) — 연장 고점 = 세션 최고가" style={{ color: "var(--text-tertiary)" }}>무눌림</span>}
            </span>
        </>
    );
}
