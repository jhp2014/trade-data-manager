import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkbench, type NewsSearchEngine } from "../store/workbench.js";
import { fetchHtsNews, type HtsNewsItem, type HeadlineCursor } from "../api/news.js";
import { useStockName } from "../lib/useStockName.js";
import { dateLabel } from "../lib/date.js";
import { escapeRegExp } from "../lib/text.js";
import { ChevronDownIcon, BackIcon } from "../components/icons.js";

// HTS(시황) 뉴스 패널 — 종목의 그 날 헤드라인을 최신순으로. code/date 는 Focus 를 따르되,
// 검색 모드(일봉 봉 클릭)면 search.{code,date} 를 사용(뱃지+✕ 로 해제). 검색 모드에선 time 상호작용 off.
// 본문 시각 3계층(당일·장중이전/당일/과거) + 제목에 종목명 하이라이트(좌우탐색 없음). 헤더 2줄.
const PAGE = 30;
const INTRADAY_FILL = "rgba(22,121,111,0.14)"; // 현재시간 이전(장중 참고가능) 시각 셀 채움 — --accent-primary 틴트

export function HtsNewsPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const setTime = useWorkbench((s) => s.setTime);
    const search = useWorkbench((s) => s.search);
    const setSearch = useWorkbench((s) => s.setSearch);
    const engine = useWorkbench((s) => s.newsSearchEngine);
    const setEngine = useWorkbench((s) => s.setNewsSearchEngine);
    const qc = useQueryClient();
    const listRef = useRef<HTMLDivElement | null>(null);
    const selfSet = useRef(false);
    const scrolledForRef = useRef<string | null>(null); // 이 (date,focus.time) 로 이미 스크롤했나 — 페이징 재실행 시 재스크롤 방지
    const rafRef = useRef(0);
    const [visibleDate, setVisibleDate] = useState(focusDate);

    // 유효 code/date — 검색 모드면 search, 아니면 Focus.
    const inSearch = search != null;
    const code = inSearch ? search.code : focusCode;
    const date = inSearch ? search.date : focusDate;

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)

    const q = useInfiniteQuery({
        queryKey: ["news-hts", code, date],
        initialPageParam: null as HeadlineCursor | null,
        queryFn: ({ pageParam, signal }) => fetchHtsNews({ code, date, before: pageParam, limit: PAGE }, signal),
        getNextPageParam: (lastPage, allPages) => {
            const isDayPage = allPages.length === 1;
            if (!isDayPage && lastPage.length < PAGE) return undefined;
            for (let i = allPages.length - 1; i >= 0; i--) {
                const p = allPages[i];
                if (p.length > 0) {
                    const oldest = p[p.length - 1];
                    return { date: oldest.date, srno: oldest.srno };
                }
            }
            return { date, srno: "0" };
        },
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });

    const items = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
    const visibleCount = useMemo(() => items.filter((it) => it.date === visibleDate).length, [items, visibleDate]);

    useEffect(() => setVisibleDate(date), [date]);

    const onScroll = (): void => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const c = listRef.current;
            if (!c) return;
            const cTop = c.getBoundingClientRect().top;
            let cur = "";
            for (const d of c.querySelectorAll<HTMLElement>("[data-date-divider]")) {
                if (d.getBoundingClientRect().top - cTop <= 8) cur = d.dataset.date ?? cur;
                else break;
            }
            if (cur) setVisibleDate(cur);
        });
    };
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    // focus.time 외부 변경 → 그 시각 위치로 스크롤. 뉴스가 나중에 도착해도 스크롤되게 deps 에 items 포함하되,
    // (date,focus.time) 단위 "이미 스크롤함" 가드로 페이징(items 증가) 때 재스크롤은 막는다. 검색 모드에선 스킵.
    useEffect(() => {
        const key = focusTime ? `${date}|${focusTime}` : null;
        if (selfSet.current) {
            selfSet.current = false;
            scrolledForRef.current = key; // 내가 세팅한 시각 → 스크롤 불필요, 완료로 표시
            return;
        }
        if (inSearch || !focusTime) return;
        if (scrolledForRef.current === key) return; // 이 시각으로 이미 스크롤(페이징 재실행 무시)
        const container = listRef.current;
        if (!container) return;
        const today = items.filter((it) => it.date === date);
        if (today.length === 0) return; // 아직 미도착 → items 변경 때 재시도
        const target = today.find((it) => it.time <= focusTime) ?? today[today.length - 1];
        container.querySelector(`[data-srno="${target.srno}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        scrolledForRef.current = key;
    }, [focusTime, date, items, inSearch]);

    const refresh = (): void => {
        void qc.resetQueries({ queryKey: ["news-hts", code, date] });
    };
    const pick = (it: HtsNewsItem): void => {
        if (inSearch || it.date !== date || it.time === focusTime) return;
        selfSet.current = true;
        setTime(it.time);
    };

    if (!code) return <Center text="종목을 선택하세요" />;

    const canLoadMore = q.hasNextPage && !q.isFetchingNextPage;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 2줄 — 1: 종목명·검색뱃지·아이콘 / 2: 현재 날짜·건수 */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 6, padding: "5px 10px", overflow: "hidden" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flexShrink: 1 }}>{name ?? code}</span>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        {inSearch && (
                            <IconButton onClick={() => setSearch(null)} title="검색 모드 해제 — Focus 로 돌아가기">
                                <BackIcon />
                            </IconButton>
                        )}
                        <EngineToggle engine={engine} onToggle={() => setEngine(engine === "naver" ? "google" : "naver")} />
                        <IconButton onClick={refresh} title="새로고침 — 당일만 다시 보기">
                            <RefreshIcon />
                        </IconButton>
                        <IconButton onClick={() => void q.fetchNextPage()} disabled={!canLoadMore} title={q.isFetchingNextPage ? "불러오는 중…" : "과거 더 보기 — 그 날부터 과거로"}>
                            <ChevronDownIcon />
                        </IconButton>
                    </div>
                </div>
                <div className="tabular" style={{ padding: "0 10px 5px", fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 8 }}>
                    <span>{dateLabel(visibleDate)}</span>
                    {visibleCount > 0 && <span>{visibleCount}건</span>}
                </div>
            </div>

            {/* 본문 */}
            <div ref={listRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {q.isLoading && <Center text="로딩중…" />}
                {q.isError && <Center text={`오류: ${(q.error as Error).message}`} />}
                {!q.isLoading && !q.isError && items.length === 0 && <Center text="당일 뉴스 없음" />}
                <NewsList items={items} focusDate={date} focusTime={focusTime} timeInteractive={!inSearch} name={name} engine={engine} onPick={pick} />
            </div>
        </div>
    );
}

function NewsList({
    items,
    focusDate,
    focusTime,
    timeInteractive,
    name,
    engine,
    onPick,
}: {
    items: HtsNewsItem[];
    focusDate: string;
    focusTime: string | null;
    timeInteractive: boolean;
    name: string | null;
    engine: NewsSearchEngine;
    onPick: (it: HtsNewsItem) => void;
}): JSX.Element {
    const isGoogle = engine === "google";
    const nameRe = useMemo(() => (name ? new RegExp(`(${escapeRegExp(name)})`, "g") : null), [name]);
    let prevDate = "";
    return (
        <div>
            {items.map((it) => {
                const showDate = it.date !== prevDate;
                prevDate = it.date;
                const isToday = it.date === focusDate;
                const timeClickable = timeInteractive && isToday;
                const isIntradayPast = timeClickable && focusTime != null && it.time <= focusTime;
                return (
                    <div key={it.srno}>
                        {showDate && (
                            <div data-date-divider data-date={it.date} className="tabular" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", background: "var(--bg-secondary)" }}>
                                {dateLabel(it.date)}
                            </div>
                        )}
                        <div data-srno={it.srno} style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border-subtle)", fontSize: 13, lineHeight: 1.4 }}>
                            <span
                                className={timeClickable ? "tabular news-time" : "tabular"}
                                onClick={timeClickable ? () => onPick(it) : undefined}
                                title={timeClickable ? "이 시각으로 이동" : undefined}
                                style={{
                                    flexShrink: 0,
                                    width: 46,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: isToday ? "var(--accent-primary)" : "var(--text-tertiary)",
                                    background: isIntradayPast ? INTRADAY_FILL : undefined,
                                }}
                            >
                                {it.time.slice(0, 5)}
                            </span>
                            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, padding: "6px 10px" }}>
                                <span
                                    className="news-title"
                                    title={isGoogle ? "클릭 — 구글에서 이 제목 검색(기준일 ±2일)" : "클릭 — 네이버 뉴스에서 이 제목·날짜로 검색"}
                                    onClick={() => window.open(isGoogle ? googleUrl(it.title, it.date) : naverNewsUrl(it.title, it.date), "_blank", "noopener,noreferrer")}
                                    style={{ flex: 1, minWidth: 0, color: "var(--text-primary)" }}
                                >
                                    {highlightName(it.title, nameRe)}
                                </span>
                                {it.sourceName && (
                                    <span style={{ flexShrink: 0, fontSize: 11, color: "var(--text-tertiary)", alignSelf: "flex-start", marginTop: 1 }}>{it.sourceName}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// 제목에서 종목명을 solid teal 칩(.tg-hl)으로 강조. 좌우탐색 없음(단순 시각 강조). re 없으면 원문.
function highlightName(title: string, re: RegExp | null): ReactNode[] {
    if (!re) return [title];
    const nodes: ReactNode[] = [];
    let last = 0;
    for (const m of title.matchAll(re)) {
        const idx = m.index ?? 0;
        if (idx > last) nodes.push(title.slice(last, idx));
        nodes.push(
            <span className="tg-hl" key={idx}>
                {m[0]}
            </span>,
        );
        last = idx + m[0].length;
    }
    if (last < title.length) nodes.push(title.slice(last));
    return nodes;
}

function IconButton({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string }): JSX.Element {
    return (
        <button className="icon-btn" onClick={onClick} disabled={disabled} title={title}>
            {children}
        </button>
    );
}

function RefreshIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
    );
}

function naverNewsUrl(title: string, date: string): string {
    const dot = date.replace(/-/g, ".");
    const compact = date.replace(/-/g, "");
    const q = encodeURIComponent(title);
    return `https://search.naver.com/search.naver?where=news&query=${q}&pd=3&ds=${dot}&de=${dot}&nso=so:r,p:from${compact}to${compact},a:all`;
}

function usDateShift(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function googleUrl(title: string, date: string): string {
    const q = encodeURIComponent(title);
    const min = usDateShift(date, -2);
    const max = usDateShift(date, 2);
    return `https://www.google.com/search?q=${q}&tbs=cdr:1,cd_min:${min},cd_max:${max}`;
}

function EngineToggle({ engine, onToggle }: { engine: NewsSearchEngine; onToggle: () => void }): JSX.Element {
    const isNaver = engine === "naver";
    return (
        <button
            className="engine-toggle tabular"
            onClick={onToggle}
            title={`검색 엔진: ${isNaver ? "네이버(제목+날짜)" : "구글(제목+±2일)"} · 클릭해 전환`}
            style={{ fontSize: 13, color: isNaver ? "#03C75A" : "#4285F4" }}
        >
            {isNaver ? "N" : "G"}
        </button>
    );
}

function Center({ text }: { text: string }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)", fontSize: 13 }}>
            {text}
        </div>
    );
}
