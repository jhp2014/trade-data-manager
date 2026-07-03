import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchChart } from "../api/chart.js";
import { fetchDaySummary } from "../api/daySummary.js";
import { fetchPriceLines, addPriceLine, removePriceLine, type RenderLine } from "../api/priceLines.js";
import { fetchReviewPoints, upsertReviewPoint, removeReviewPoint } from "../api/reviewPoints.js";
import { deriveMinuteView, deriveDailyView, kstToUnix } from "../lib/derive.js";
import { MinuteChart } from "../chart/MinuteChart.js";
import { DailyChart } from "../chart/DailyChart.js";

// 차트 패널 — 일봉(상) + 분봉(하) 듀얼. 영역 더블클릭 = 그 영역만 보기 ↔ 둘 다.
// 좌상단 종목명(day-summary 캐시 조회), 우상단 통합 세그먼트 컨트롤(마커·타점정보·clear·시장).
// code/date/time 은 Focus 구독. 분봉 좌클릭=타점 이동, 스페이스바=타점 저장(토글).
export function ChartPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const time = useWorkbench((s) => s.focus.time);
    const setTime = useWorkbench((s) => s.setTime);
    const mode = useWorkbench((s) => s.chartPriceMode);
    const setMode = useWorkbench((s) => s.setChartPriceMode);
    const [expanded, setExpanded] = useState<"daily" | "minute" | null>(null);
    const [showMarkers, setShowMarkers] = useState(true); // 분봉 거래대금 마커 ON/OFF
    const [showPointInfo, setShowPointInfo] = useState(false); // 현재 타점 정보 박스 토글

    const query = useQuery({
        queryKey: ["chart", code, date],
        queryFn: () => fetchChart(code, date),
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });
    // 종목명 — day-summary 캐시(보드가 이미 페치)에서 조회. 추가 페치 없음.
    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });
    const name = summaryQ.data?.stocks.find((s) => s.stockCode === code)?.name ?? null;

    const minuteView = useMemo(() => (query.data ? deriveMinuteView(query.data, mode) : null), [query.data, mode]);
    const dailyView = useMemo(() => (query.data ? deriveDailyView(query.data, mode) : null), [query.data, mode]);

    const toggleExpand = (which: "daily" | "minute"): void => setExpanded((cur) => (cur === which ? null : which));

    const qc = useQueryClient();

    // 가격선 주석 — 조회 + 우클릭 토글(자동 저장) + clear(전체 삭제).
    const linesQ = useQuery({
        queryKey: ["price-lines", code, date],
        queryFn: () => fetchPriceLines(code, date),
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });
    const lines = useMemo(() => linesQ.data ?? [], [linesQ.data]);
    // 앵커(캔들 좌표) → 로드된 캔들에서 raw 가격 해소(RenderLine). 앵커 캔들이 아직 없으면 그 선은 생략.
    // anchorTime 유무로 일봉(D)/분봉(M) 구분. field=고/저/시/종(현재 UI 는 high).
    const resolvedLines = useMemo<RenderLine[]>(() => {
        if (!dailyView || !minuteView) return [];
        const dailyByDate = new Map(dailyView.map((p) => [p.time, p] as const));
        const minuteByKey = new Map(minuteView.points.map((p) => [`${p.date}T${p.tradeTime}`, p] as const));
        const out: RenderLine[] = [];
        for (const l of lines) {
            if (!l.id) continue;
            if (l.anchorTime) {
                const mp = minuteByKey.get(`${l.anchorDate}T${l.anchorTime}`);
                if (mp) out.push({ id: l.id, price: mp.highPrice, kind: "M" });
            } else {
                const dp = dailyByDate.get(l.anchorDate);
                if (dp) out.push({ id: l.id, price: dp[l.field], kind: "D" });
            }
        }
        return out;
    }, [lines, dailyView, minuteView]);
    const dLines = useMemo(() => resolvedLines.filter((l) => l.kind === "D"), [resolvedLines]);
    const invalidateLines = (): void => {
        void qc.invalidateQueries({ queryKey: ["price-lines", code, date] });
    };
    const addMut = useMutation({ mutationFn: addPriceLine, onSuccess: invalidateLines });
    const removeMut = useMutation({ mutationFn: removePriceLine, onSuccess: invalidateLines });
    // clear — 이 차트의 가격선 전체 삭제(우클릭이 잘 안 잡히는 경우 대비). 저장 타점은 건드리지 않음.
    const clearMut = useMutation({
        mutationFn: async () => {
            await Promise.all(lines.filter((l) => l.id).map((l) => removePriceLine(l.id!)));
        },
        onSuccess: invalidateLines,
    });
    // 봉 우클릭 = 그 봉 앵커에 선 토글. 같은 앵커(anchorDate+anchorTime)가 이미 있으면 삭제, 없으면 추가.
    const toggleLine = (anchorDate: string, anchorTime: string | undefined): void => {
        if (!code || !date) return;
        const existing = lines.find(
            (l) => l.anchorDate === anchorDate && (l.anchorTime ?? undefined) === anchorTime,
        );
        if (existing?.id) removeMut.mutate(existing.id);
        else addMut.mutate({ stockCode: code, date, anchorDate, anchorTime, field: "high" });
    };
    // 라벨/선 우클릭 삭제 — id 로 바로 제거(D/M 무관).
    const removeLine = (line: RenderLine): void => {
        removeMut.mutate(line.id);
    };

    // 복기 타점 — 조회 + 스페이스바 저장(토글). 저장된 타점은 흐린 세로선 + hover 아이콘.
    const reviewQ = useQuery({
        queryKey: ["review-points", code, date],
        queryFn: () => fetchReviewPoints(code, date),
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });
    const reviewPoints = useMemo(() => reviewQ.data ?? [], [reviewQ.data]);
    const invalidateReview = (): void => {
        void qc.invalidateQueries({ queryKey: ["review-points", code, date] });
    };
    const upsertRpMut = useMutation({ mutationFn: upsertReviewPoint, onSuccess: invalidateReview });
    const removeRpMut = useMutation({
        mutationFn: (v: { code: string; date: string; time: string }) => removeReviewPoint(v.code, v.date, v.time),
        onSuccess: invalidateReview,
    });
    // 저장된 타점 시각(unix초) — 분봉 세로선/아이콘용.
    const savedTimes = useMemo(
        () => (date ? reviewPoints.map((rp) => kstToUnix(date, rp.time)) : []),
        [reviewPoints, date],
    );

    // 스페이스바 = 현재 Focus.time 타점 저장 토글(같은 시각 있으면 삭제). 입력창 포커스 중엔 무시.
    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.code !== "Space") return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
            if (!code || !date || !time) return;
            e.preventDefault();
            const existing = reviewPoints.find((rp) => rp.time === time);
            if (existing) removeRpMut.mutate({ code, date, time });
            else upsertRpMut.mutate({ stockCode: code, date, time });
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [code, date, time, reviewPoints]); // eslint-disable-line react-hooks/exhaustive-deps

    // Focus.time(HH:MM:SS) → 분봉 세로선 unix초. null 이면 세로선 없음.
    const markerTime = useMemo(() => (time && date ? kstToUnix(date, time) : null), [time, date]);
    const hasLines = lines.length > 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>{name ?? code ?? "—"}</span>
                {name && <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>}
                <span style={{ color: "var(--text-tertiary)" }}>{date}</span>
                {minuteView?.baseFallback && <span style={{ color: "var(--warning)", fontSize: 11 }} title="직전 종가 없음 → 당일 첫 시가 기준">상장일 기준</span>}
                {/* 통합 세그먼트 컨트롤 — 마커·타점정보·clear·시장(UN/KRX 단일 토글) */}
                <div style={{ marginLeft: "auto", display: "flex", border: "1px solid var(--border-default)", borderRadius: 6, overflow: "hidden" }}>
                    <SegButton first active={showMarkers} onClick={() => setShowMarkers((v) => !v)} title={showMarkers ? "거래대금 마커 끄기" : "거래대금 마커 켜기"}>
                        <EyeIcon off={!showMarkers} />
                    </SegButton>
                    <SegButton active={showPointInfo} onClick={() => setShowPointInfo((v) => !v)} title={showPointInfo ? "현재 타점 정보 끄기" : "현재 타점 정보 켜기"}>
                        <InfoIcon />
                    </SegButton>
                    <SegButton active={false} disabled={!hasLines} onClick={() => hasLines && clearMut.mutate()} title="가격선 전체 지우기">
                        <TrashIcon />
                    </SegButton>
                    <SegButton active onClick={() => setMode(mode === "un" ? "krx" : "un")} title={`클릭: 시장 전환 (현재 ${mode.toUpperCase()})`}>
                        <span style={{ fontWeight: 600, minWidth: 30, textAlign: "center" }}>{mode.toUpperCase()}</span>
                    </SegButton>
                </div>
            </div>

            {/* 본문 */}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {!code && <Center text="종목을 선택하세요" />}
                {code && query.isLoading && <Center text={`${code} 로딩중…`} />}
                {query.isError && <Center text={`오류: ${(query.error as Error).message}`} />}
                {minuteView && dailyView && (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        {expanded !== "minute" && (
                            <div onDoubleClick={() => toggleExpand("daily")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 봉 우클릭: 고점 선(D)">
                                <PaneLabel text="일봉" />
                                {dailyView.length > 0 ? <DailyChart points={dailyView} lines={dLines} onRightClick={(anchorDate) => toggleLine(anchorDate, undefined)} onRemoveLine={removeLine} /> : <Center text="일봉 없음" />}
                            </div>
                        )}
                        {expanded === null && <div style={{ height: 1, background: "var(--border-default)", flexShrink: 0 }} />}
                        {expanded !== "daily" && (
                            <div onDoubleClick={() => toggleExpand("minute")} style={{ flex: 1, minHeight: 0, position: "relative" }} title="더블클릭: 이 영역만 / 둘 다 · 좌클릭: 타점 이동 · 스페이스바: 타점 저장 · 봉 우클릭: 선(M)">
                                <PaneLabel text="분봉" />
                                {minuteView.points.length > 0 ? (
                                    <MinuteChart
                                        points={minuteView.points}
                                        showAmountMarkers={showMarkers}
                                        lines={resolvedLines}
                                        base={minuteView.base}
                                        markerTime={markerTime}
                                        savedTimes={savedTimes}
                                        showPointInfo={showPointInfo}
                                        onMovePoint={(t) => setTime(t)}
                                        onRightClick={(a) => toggleLine(a.date, a.time)}
                                        onRemoveLine={removeLine}
                                    />
                                ) : (
                                    <Center text={mode === "krx" ? "KRX 분봉 없음" : "분봉 없음"} />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// 통합 세그먼트 버튼 — 우상단 컨트롤 바 1개 안의 칸. 첫 칸이 아니면 좌측 구분선.
function SegButton({
    active,
    disabled = false,
    first = false,
    onClick,
    title,
    children,
}: {
    active: boolean;
    disabled?: boolean;
    first?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}): JSX.Element {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "3px 9px",
                border: "none",
                borderLeft: first ? "none" : "1px solid var(--border-default)",
                background: active ? "var(--accent-primary)" : "var(--bg-primary)",
                color: active ? "#fff" : "var(--text-secondary)",
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.4 : 1,
            }}
        >
            {children}
        </button>
    );
}

function PaneLabel({ text }: { text: string }): JSX.Element {
    return (
        <span style={{ position: "absolute", top: 4, left: 8, zIndex: 5, fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", background: "var(--bg-primary)", padding: "0 4px", borderRadius: 4, pointerEvents: "none" }}>
            {text}
        </span>
    );
}

// 거래대금 마커 표시/숨김 아이콘 — market-eye eye / eye-off.
function EyeIcon({ off }: { off?: boolean }): JSX.Element {
    return off ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
    ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

// 현재 타점 정보 토글 아이콘 — info.
function InfoIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

// 가격선 전체 지우기 아이콘 — trash.
function TrashIcon(): JSX.Element {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", fontSize: 13, pointerEvents: "none" }}>
            {text}
        </div>
    );
}
