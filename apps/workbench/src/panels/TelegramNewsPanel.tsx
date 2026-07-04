import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkbench } from "../store/workbench.js";
import { fetchTelegramNews, type TelegramNewsItem } from "../api/telegramNews.js";
import { fetchDaySummary } from "../api/daySummary.js";

// 텔레그램 뉴스 패널 — 등록 방 전체 키워드 검색(focus.date KST 하루 스코프), 최신순.
// 검색어 = 포커스 종목명 자동채움 + 편집. 자동검색 안 함 = 중앙 입력창에서 Enter/검색 버튼 수동 트리거(FLOOD 회피).
// 종목/검색어 바뀌면 결과 비우고 중앙 입력. 더보기 = before 시각 커서로 조금씩 과거 페이징(날짜 넘어감).
// 헤더 2줄(1=키워드·검색·매치이동·더보기 / 2=현재 보는 날짜·시간). 본문 하이라이트 + Ctrl+F 식 매치 이동.
// 현재시간 이전(focus.time 이하, 당일)은 시간값 배경으로 구분. focus.time 이동 시 그 이하 최근으로 스크롤.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const INTRADAY_BG = "rgba(22,121,111,0.14)"; // 현재시간 이전 시간값 배경 — --accent-primary 틴트

export function TelegramNewsPanel(): JSX.Element {
    const focusCode = useWorkbench((s) => s.focus.code);
    const focusDate = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const search = useWorkbench((s) => s.search);
    const setSearch = useWorkbench((s) => s.setSearch);
    const qc = useQueryClient();
    const listRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef(0);

    // 유효 code/targetDate — 검색 모드면 search, 아니면 Focus. targetDate = 검색하려는 날짜(미확정).
    const inSearch = search != null;
    const code = inSearch ? search.code : focusCode;
    const targetDate = inSearch ? search.date : focusDate;

    // 종목명 — Focus 날짜 캐시(code === focus.code 라 항상 해소).
    const summaryQ = useQuery({
        queryKey: ["day-summary", focusDate],
        queryFn: () => fetchDaySummary(focusDate),
        enabled: focusDate.length > 0,
        staleTime: Infinity,
    });
    const name = useMemo(() => summaryQ.data?.stocks.find((s) => s.stockCode === code)?.name ?? null, [summaryQ.data, code]);

    const [input, setInput] = useState("");
    const [query, setQuery] = useState(""); // 확정 검색어(수동 트리거로만 갱신)
    const [searchDate, setSearchDate] = useState(""); // 확정 검색 날짜. targetDate 와 다르면 pending(검색 모드도 여기 걸림)
    const [editing, setEditing] = useState(false); // 사용자가 명시적으로 편집 진입(중앙 입력 autofocus)
    const [visibleAt, setVisibleAt] = useState<string | null>(null); // 스크롤 최상단 항목 시각(헤더 2줄)
    const [activeMatch, setActiveMatch] = useState(-1); // Ctrl+F 현재 매치. -1 = 활성 없음(주황 해제)

    useEffect(() => {
        setInput(name ?? "");
    }, [name]);

    const q = useInfiniteQuery({
        queryKey: ["news-telegram", query, searchDate],
        initialPageParam: null as string | null, // beforeDate 커서(YYYY-MM-DD). null = searchDate 하루
        queryFn: ({ pageParam }) => fetchTelegramNews({ q: query, date: searchDate, beforeDate: pageParam ?? undefined }),
        getNextPageParam: (lastPage, allPages) => {
            // 초기 페이지는 비어도 더보기 허용(과거에 있을 수 있음). 더보기 페이지가 비면 종료(과거 소진).
            const isInitial = allPages.length === 1;
            if (!isInitial && lastPage.items.length === 0) return undefined;
            return lastPage.oldestDate; // 이 페이지가 걸어간 가장 과거 날짜 = 다음 커서
        },
        enabled: query.length > 0 && searchDate.length > 0,
        staleTime: Infinity,
    });

    const items = useMemo(() => {
        const seen = new Set<string>();
        const out: TelegramNewsItem[] = [];
        for (const p of q.data?.pages ?? []) {
            for (const it of p.items) {
                if (!seen.has(it.ref)) {
                    seen.add(it.ref);
                    out.push(it);
                }
            }
        }
        return out;
    }, [q.data]);

    const hlRe = useMemo(() => {
        const tokens = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
        return tokens.length ? new RegExp(`(${tokens.join("|")})`, "gi") : null;
    }, [query]);
    const totalMatches = useMemo(() => items.reduce((a, it) => a + countMatches(it.text, hlRe), 0), [items, hlRe]);

    // 검색어 또는 날짜가 확정본과 다르면 pending → 중앙 입력(CTA). 검색 모드(봉클릭 날짜 변경)도 여기 걸려 "세팅만" 됨.
    const pending = input.trim() !== query || targetDate !== searchDate;
    const showEdit = editing || pending || query.length === 0;
    const canLoadMore = q.hasNextPage && !q.isFetchingNextPage;

    // 현재시간 커서 — 검색 모드에선 없음(그 날짜엔 focus.time 무의미). 정상 모드에서만 focus.date+focus.time.
    const cursorMs = useMemo(() => (!inSearch && focusTime ? new Date(`${focusDate}T${focusTime}+09:00`).getTime() : null), [inSearch, focusDate, focusTime]);

    const runSearch = (): void => {
        const next = input.trim();
        if (!next) return;
        if (next === query && targetDate === searchDate) void qc.resetQueries({ queryKey: ["news-telegram", next, targetDate] });
        else {
            setQuery(next);
            setSearchDate(targetDate);
        }
        setEditing(false);
        setActiveMatch(-1);
    };

    useEffect(() => {
        setVisibleAt(null);
        setActiveMatch(-1);
    }, [searchDate, query]);

    // Ctrl+F 매치 이동 → 해당 하이라이트로 스크롤.
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-hl-index="${activeMatch}"]`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [activeMatch]);

    // focus.time 이동 → 그 시각 이하(과거) 중 가장 최근 항목의 첫 키워드 매치로 스크롤 + 좌우탐색 앵커를 거기로.
    // 매치 없는 항목(링크 프리뷰로만 잡힌 경우)이면 항목 자체로 스크롤. (편집 중엔 스킵)
    useEffect(() => {
        if (showEdit) return;
        // 시간 마커 없거나(null) 그 시각 이하 항목/매치가 없으면 활성(주황) 해제. 있으면 그 매치로 이동+앵커.
        const target = cursorMs == null ? undefined : items.find((it) => new Date(it.at).getTime() <= cursorMs);
        const el = target ? listRef.current?.querySelector<HTMLElement>(`[data-item-ref="${target.ref}"]`) : null;
        const hl = el?.querySelector<HTMLElement>("[data-hl-index]");
        if (hl) {
            setActiveMatch(Number(hl.dataset.hlIndex));
            hl.scrollIntoView({ block: "center", behavior: "smooth" });
        } else {
            setActiveMatch(-1); // 조건 해당 항목/매치 없음 → 이전 활성 해제
            el?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }, [cursorMs]); // eslint-disable-line react-hooks/exhaustive-deps

    // 스크롤 최상단 항목 시각 → 헤더 2줄.
    const onScroll = (): void => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const c = listRef.current;
            if (!c) return;
            const cTop = c.getBoundingClientRect().top;
            let cur = "";
            for (const el of c.querySelectorAll<HTMLElement>("[data-at]")) {
                if (el.getBoundingClientRect().top - cTop <= 8) cur = el.dataset.at ?? cur;
                else break;
            }
            if (cur) setVisibleAt(cur);
        });
    };
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const gotoMatch = (delta: number): void => {
        if (totalMatches === 0) return;
        setActiveMatch((a) => (a < 0 ? (delta > 0 ? 0 : totalMatches - 1) : (a + delta + totalMatches) % totalMatches));
    };

    const posAt = visibleAt ?? items[0]?.at ?? null;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 2줄 */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                {/* 1줄 — 키워드·🔍 … ◂▸·더보기 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", overflow: "hidden" }}>
                    <button onClick={() => setEditing(true)} title="검색어 편집" style={{ flexShrink: 1, minWidth: 0, textAlign: "left", fontWeight: 700, fontSize: 14, color: input.trim() ? "var(--text-primary)" : "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {input.trim() || "검색"}
                    </button>
                    <button className="icon-btn" onClick={() => setEditing(true)} title="검색" style={{ flexShrink: 0 }}>
                        <SearchIcon />
                    </button>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                        {inSearch && (
                            <button className="icon-btn" onClick={() => setSearch(null)} title="검색 모드 해제 — Focus 로 돌아가기" style={{ marginRight: 2 }}>
                                <BackIcon />
                            </button>
                        )}
                        {!showEdit && totalMatches > 0 && (
                            <>
                                <button className="icon-btn" onClick={() => gotoMatch(-1)} title="이전 매치" style={{ padding: "0 2px" }}>◂</button>
                                <span className="tabular" style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 34, textAlign: "center" }}>{activeMatch >= 0 ? activeMatch + 1 : "–"}/{totalMatches}</span>
                                <button className="icon-btn" onClick={() => gotoMatch(1)} title="다음 매치" style={{ padding: "0 2px" }}>▸</button>
                            </>
                        )}
                        <button className="icon-btn" onClick={() => void q.fetchNextPage()} disabled={!canLoadMore} title={q.isFetchingNextPage ? "불러오는 중…" : "더보기 — 과거로"} style={{ marginLeft: 4 }}>
                            <ChevronDownIcon />
                        </button>
                    </div>
                </div>
                {/* 2줄 — 현재 보는 날짜·시간 */}
                {!showEdit && posAt && (
                    <div className="tabular" style={{ padding: "0 10px 5px", fontSize: 11, color: "var(--text-tertiary)" }}>
                        {dateLabel(kstDate(posAt))} {kstHm(posAt)}
                    </div>
                )}
            </div>

            {/* 본문 */}
            <div ref={listRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {showEdit ? (
                    <Center>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 280, maxWidth: "84%" }}>
                            <input
                                autoFocus={editing}
                                value={input}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") runSearch();
                                    else if (e.key === "Escape") {
                                        setInput(query);
                                        setEditing(false);
                                    }
                                }}
                                placeholder="종목명·키워드"
                                style={{ fontSize: 14, padding: "8px 12px", color: "var(--text-primary)", background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 8, outline: "none", textAlign: "center" }}
                            />
                            <button onClick={runSearch} disabled={!input.trim()} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", fontSize: 14, fontWeight: 600, color: "#fff", background: "var(--accent-primary)", border: "none", borderRadius: 8, cursor: input.trim() ? "pointer" : "default", opacity: input.trim() ? 1 : 0.5 }}>
                                <SearchIcon />
                                <span>검색</span>
                            </button>
                        </div>
                    </Center>
                ) : (
                    <>
                        {q.isLoading && <Center><span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>검색 중… (텔레그램)</span></Center>}
                        {q.isError && <Center><span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>오류: {(q.error as Error).message}</span></Center>}
                        {!q.isLoading && !q.isError && items.length === 0 && <Center><span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>결과 없음</span></Center>}
                        <NewsList items={items} hlRe={hlRe} activeMatch={activeMatch} focusDate={focusDate} cursorMs={cursorMs} />
                    </>
                )}
            </div>
        </div>
    );
}

function NewsList({ items, hlRe, activeMatch, focusDate, cursorMs }: { items: TelegramNewsItem[]; hlRe: RegExp | null; activeMatch: number; focusDate: string; cursorMs: number | null }): JSX.Element {
    const counter = { n: 0 };
    let prevDate = "";
    return (
        <div>
            {items.map((it) => {
                const d = kstDate(it.at);
                const showDate = d !== prevDate;
                prevDate = d;
                // 현재시간 이전(당일 & focus.time 이하) → 시간값 배경 강조.
                const intradayPast = cursorMs != null && d === focusDate && new Date(it.at).getTime() <= cursorMs;
                // 이 카드의 매치 인덱스 구간 [startIdx, counter.n) 에 activeMatch 가 있으면 = 현재 주황 매치 보유 카드.
                const startIdx = counter.n;
                const textNodes = highlightNodes(it.text, hlRe, counter, activeMatch);
                const isActiveCard = hlRe != null && activeMatch >= startIdx && activeMatch < counter.n;
                return (
                    <div key={it.ref}>
                        {showDate && (
                            <div data-date-divider data-date={d} className="tabular" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", background: "var(--bg-secondary)" }}>
                                {dateLabel(d)}
                            </div>
                        )}
                        <div
                            data-item-ref={it.ref}
                            data-at={it.at}
                            style={{
                                padding: "8px 10px",
                                borderBottom: "1px solid var(--border-subtle)",
                                borderLeft: isActiveCard ? "3px solid #f59e0b" : "3px solid transparent", // 항상 3px → 레이아웃 안 흔들림
                                background: isActiveCard ? "rgba(245,158,11,0.06)" : undefined,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span
                                    className="tabular"
                                    style={{
                                        flexShrink: 0,
                                        fontSize: 11,
                                        color: "var(--accent-primary)",
                                        fontWeight: 600,
                                        background: intradayPast ? INTRADAY_BG : undefined,
                                        borderRadius: intradayPast ? 4 : undefined,
                                        padding: intradayPast ? "1px 5px" : undefined,
                                    }}
                                >
                                    {kstHm(it.at)}
                                </span>
                                <span style={{ flexShrink: 0, fontSize: 10, color: "var(--text-tertiary)", padding: "1px 6px", background: "var(--bg-secondary)", borderRadius: 999, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60%" }}>{it.channel}</span>
                            </div>
                            <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{textNodes}</div>
                            {it.url && (
                                <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 4, fontSize: 11, color: "var(--accent-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                                    🔗 {hostOf(it.url)}
                                </a>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function highlightNodes(text: string, re: RegExp | null, counter: { n: number }, activeMatch: number): ReactNode[] {
    if (!re) return [text];
    const nodes: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
        const idx = m.index ?? 0;
        if (idx > last) nodes.push(text.slice(last, idx));
        const gi = counter.n++;
        nodes.push(
            <span className={gi === activeMatch ? "tg-hl tg-hl-active" : "tg-hl"} data-hl-index={gi} key={`${idx}-${gi}`}>
                {m[0]}
            </span>,
        );
        last = idx + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

function countMatches(text: string, re: RegExp | null): number {
    if (!re) return 0;
    let n = 0;
    for (const _m of text.matchAll(re)) n++;
    return n;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function kstDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function kstHm(iso: string): string {
    return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
}

function dateLabel(date: string): string {
    if (!date) return "";
    const w = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()] ?? "";
    return `${date} (${w})`;
}

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url.slice(0, 40);
    }
}

function SearchIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}

function ChevronDownIcon(): JSX.Element {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

// 검색 모드 해제(←) — Focus 로 돌아가기.
function BackIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
        </svg>
    );
}

function Center({ children }: { children: ReactNode }): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 20px", textAlign: "center" }}>
            {children}
        </div>
    );
}
