import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchPriceLinedStocks } from "../api/priceLines.js";
import { fetchAllPoints, type ReviewPointListItem } from "../api/reviewPoints.js";
import { BoardCenter } from "../components/board/BoardCard.js";
import { MonthPicker, LocateIcon, DateHeader, Name, PointRow } from "./WorksetRows.js";

// 작업셋 패널 — 선 있는 (종목,날짜) ∪ 타점을 한 리스트로 합쳐 월별로 본다.
// 선만 있고 타점 없는 종목은 이름만(타점 시각 줄 없음), 타점 있으면 아래에 시각들.
// 상단 핀 = 현재 종목 고정(이름 클릭=스크롤 점프 / 타점 클릭=이동). 스크롤 영역엔 현재 종목이 중복 표시·강조.
// 종목 이름 클릭 → date·code focus(차트 로드). 타점 클릭 → date·code·time 전부 focus.

function monthOf(date: string): string {
    return date.slice(0, 7);
}

interface StockEntry {
    date: string;
    code: string;
    name: string | null;
    points: ReviewPointListItem[];
}

export function WorksetPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const setFocus = useWorkbench((s) => s.setFocus);

    const stocksQ = useQuery({ queryKey: ["price-lined-stocks"], queryFn: fetchPriceLinedStocks, staleTime: 60_000 });
    const pointsQ = useQuery({ queryKey: ["all-points"], queryFn: fetchAllPoints, staleTime: 60_000 });
    const stocks = useMemo(() => stocksQ.data ?? [], [stocksQ.data]);
    const points = useMemo(() => pointsQ.data ?? [], [pointsQ.data]);

    // 공유 월 목록(선 ∪ 타점, 내림차순). 선택 월 = 로컬 상태(미선택이면 focus 월 → 없으면 최신).
    const months = useMemo(() => {
        const set = new Set<string>();
        for (const s of stocks) set.add(monthOf(s.date));
        for (const p of points) set.add(monthOf(p.date));
        return [...set].sort().reverse();
    }, [stocks, points]);
    const [selMonth, setSelMonth] = useState<string | null>(null);
    const month = useMemo(() => {
        if (selMonth && months.includes(selMonth)) return selMonth;
        const fm = monthOf(focusDate);
        return months.includes(fm) ? fm : (months[0] ?? fm);
    }, [selMonth, months, focusDate]);

    // 합본 — (종목,날짜) 단위로 선/타점 병합 → 날짜 내림차순, 같은 날 종목코드 오름차순 → 날짜로 그룹.
    const groups = useMemo(() => {
        const map = new Map<string, StockEntry>();
        const ensure = (date: string, code: string, name: string | null): StockEntry => {
            const k = `${date}|${code}`;
            let e = map.get(k);
            if (!e) { e = { date, code, name, points: [] }; map.set(k, e); }
            if (!e.name && name) e.name = name;
            return e;
        };
        for (const s of stocks) if (monthOf(s.date) === month) ensure(s.date, s.stockCode, s.name);
        for (const p of points) if (monthOf(p.date) === month) ensure(p.date, p.stockCode, p.name).points.push(p);
        const entries = [...map.values()];
        for (const e of entries) e.points.sort((a, b) => (a.time < b.time ? -1 : 1));
        entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.code < b.code ? -1 : 1));
        const out: { date: string; stocks: StockEntry[] }[] = [];
        for (const e of entries) {
            let g = out[out.length - 1];
            if (!g || g.date !== e.date) { g = { date: e.date, stocks: [] }; out.push(g); }
            g.stocks.push(e);
        }
        return out;
    }, [stocks, points, month]);

    // 핀 이름 — 현재 종목명(두 데이터셋 중 아무 곳). 핀은 이름만(클릭=스크롤 점프).
    const pinnedName = useMemo(() => {
        if (!focusCode) return null;
        return stocks.find((s) => s.stockCode === focusCode)?.name ?? points.find((p) => p.stockCode === focusCode)?.name ?? null;
    }, [focusCode, stocks, points]);

    // 스크롤 영역의 현재 종목 위치로 점프(핀 클릭). 현재 (날짜,종목) 우선, 없으면 그 종목 첫 등장.
    const anchorRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scrollToCurrent = (): void => {
        if (!focusCode) return;
        const exact = anchorRefs.current.get(`${focusDate}|${focusCode}`);
        const target = exact ?? [...anchorRefs.current.entries()].find(([k]) => k.endsWith(`|${focusCode}`))?.[1];
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
    };

    if (stocksQ.isLoading || pointsQ.isLoading) return <BoardCenter text="작업셋 로딩중…" />;
    if (stocksQ.isError) return <BoardCenter text={`작업셋 오류: ${(stocksQ.error as Error).message}`} />;
    if (pointsQ.isError) return <BoardCenter text={`타점 오류: ${(pointsQ.error as Error).message}`} />;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-secondary)", fontSize: 13 }}>
            {/* 월 선택 — 텍스트 + 아래 화살표 버튼(커스텀 팝오버) */}
            <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
                <MonthPicker month={month} months={months} onPick={setSelMonth} />
            </div>

            {/* 핀 — 현재 종목 고정(리스트 선택행과 다른 스타일: 흰 배경·accent 테두리·조준 아이콘). 클릭 = 스크롤 점프.
                작업셋에 없는 종목(선·타점 모두 없음)이면 코드 대신 안내 문구, 좁아지면 말줄임. */}
            {focusCode &&
                (pinnedName ? (
                    <button
                        onClick={scrollToCurrent}
                        title="스크롤: 현재 종목 위치로"
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            flexShrink: 0,
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            borderBottom: "2px solid var(--accent-primary)",
                            background: "var(--bg-primary)",
                            padding: "5px 10px",
                            cursor: "pointer",
                            font: "inherit",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
                        }}
                    >
                        <LocateIcon />
                        <Name name={pinnedName} code={focusCode} color="var(--accent-hover)" strong />
                    </button>
                ) : (
                    <div
                        title="선택한 종목은 작업셋에 없습니다"
                        style={{ flexShrink: 0, borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)", padding: "5px 10px" }}
                    >
                        <span style={{ display: "block", color: "var(--text-tertiary)", fontSize: 12, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            선택한 종목은 작업셋에 없습니다
                        </span>
                    </div>
                ))}

            {/* 스크롤 영역 — 이번 달 전체(날짜 → 종목 → 타점). 선만 있는 종목은 이름만. */}
            <div style={{ overflowY: "auto", flex: 1 }}>
                {groups.length === 0 && <div style={{ padding: 10, color: "var(--text-tertiary)", fontSize: 12, textAlign: "center" }}>이 달 항목 없음</div>}
                {groups.map((g) => (
                    <div key={g.date}>
                        <DateHeader date={g.date} />
                        {g.stocks.map((e) => {
                            const sameCode = e.code === focusCode;
                            return (
                                <div
                                    key={e.code}
                                    ref={(el) => {
                                        const k = `${e.date}|${e.code}`;
                                        if (el) anchorRefs.current.set(k, el);
                                        else anchorRefs.current.delete(k);
                                    }}
                                >
                                    <button
                                        onClick={() => setFocus({ date: e.date, code: e.code, time: null })}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            width: "100%",
                                            textAlign: "left",
                                            border: "none",
                                            borderLeft: `3px solid ${sameCode ? "var(--accent-hover)" : "transparent"}`,
                                            padding: "3px 10px",
                                            cursor: "pointer",
                                            font: "inherit",
                                            background: sameCode ? "var(--accent-primary)" : "var(--bg-tertiary)",
                                        }}
                                    >
                                        <Name name={e.name} code={e.code} color={sameCode ? "#fff" : "var(--text-primary)"} strong={sameCode} />
                                    </button>
                                    {e.points.map((p) => (
                                        <PointRow
                                            key={`${p.date}-${p.time}`}
                                            p={p}
                                            related={sameCode}
                                            current={sameCode && p.date === focusDate && p.time === focusTime}
                                            onClick={() => setFocus({ date: p.date, code: p.stockCode, time: p.time })}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
