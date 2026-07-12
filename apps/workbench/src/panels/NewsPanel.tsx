import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQueryClient, type UseInfiniteQueryResult, type QueryKey } from "@tanstack/react-query";
import { useWorkbench, type NewsSearchEngine } from "../store/workbench.js";
import { fetchHtsNews, type HtsNewsItem, type HeadlineCursor } from "../api/news.js";
import { fetchLiveNews, type LiveNewsAnchor } from "../api/liveNews.js";
import { useStockName } from "../lib/useStockName.js";
import { dateLabel, kstToday } from "../lib/date.js";
import { escapeRegExp } from "../lib/text.js";
import { ChevronDownIcon, BackIcon } from "../components/icons.js";

// 뉴스 패널(양 플레인 공통) — HTS(시황) 헤드라인을 최신순으로. plane 이 버스·소스를 고른다:
//  · replay = 복기 버스(focus/search) + DB(/api/news/hts, 커서 (date,srno) 엄격미만)
//  · live   = 실시간 버스(liveFocus/liveSearch) + KIS 온디맨드(/live/news, 앵커 (date,time) ≤ 되감기 + srno dedup)
// 모드 = 종목(code+검색날짜 추종) / 전체(시황, code 무시). 키워드 = 있으면 제목 검색, 없으면 기본 피드.
// 검색 모드(일봉 봉 클릭)면 그 날짜를 따라가고(뱃지/↺ 로 해제) time 상호작용 off. 헤더 2줄.
// 본문 시각 3계층(당일·장중이전/당일/과거) + 제목 하이라이트(종목명 또는 키워드).
const PAGE = 30;
const INTRADAY_FILL = "rgba(22,121,111,0.14)"; // 현재시간 이전(장중 참고가능) 시각 셀 채움 — --accent-primary 틴트

export type NewsPlane = "live" | "replay";
export type NewsMode = "stock" | "all";

interface Feed {
    q: UseInfiniteQueryResult<unknown>;
    items: HtsNewsItem[];
    key: QueryKey;
}

/** 페이지 배열 → srno dedup 평탄화(최신순 유지). live 앵커(≤ 포함) 경계 중복 흡수, replay 는 무해. */
function dedupPages(pages: HtsNewsItem[][] | undefined): HtsNewsItem[] {
    const seen = new Set<string>();
    const out: HtsNewsItem[] = [];
    for (const p of pages ?? []) {
        for (const it of p) {
            if (!seen.has(it.srno)) {
                seen.add(it.srno);
                out.push(it);
            }
        }
    }
    return out;
}

/** 복기 피드 — DB 커서 페이징. 종목+무키워드 초기 페이지만 "그 날 전체"(길이 무관 계속), 그 외는 limit 페이지. */
function useReplayFeed(args: { code: string; date: string; keyword: string; mode: NewsMode; enabled: boolean }): Feed {
    const { code, date, keyword, mode, enabled } = args;
    const stock = mode === "stock";
    const key: QueryKey = ["news-hts", stock ? code : "", date, keyword];
    const q = useInfiniteQuery({
        queryKey: key,
        initialPageParam: null as HeadlineCursor | null,
        queryFn: ({ pageParam, signal }) =>
            fetchHtsNews({ code: stock ? code : undefined, q: keyword || undefined, date, before: pageParam, limit: PAGE }, signal),
        getNextPageParam: (lastPage, allPages) => {
            const dayInitial = stock && !keyword && allPages.length === 1; // "그 날 전체" 페이지 — 짧아도 과거는 남아있다
            if (!dayInitial && lastPage.length < PAGE) return undefined;
            for (let i = allPages.length - 1; i >= 0; i--) {
                const p = allPages[i];
                if (p.length > 0) {
                    const oldest = p[p.length - 1];
                    return { date: oldest.date, srno: oldest.srno };
                }
            }
            return { date, srno: "0" }; // 그 날이 비었어도 과거로는 걸을 수 있다
        },
        enabled,
        staleTime: Infinity,
    });
    const items = useMemo(() => dedupPages(q.data?.pages), [q.data]);
    return { q, items, key };
}

/** (date,time) 앵커 1초 뒤로 — 한 페이지가 같은 초에 몰려 앵커가 안 움직일 때 강제 전진(무한 루프 방지). */
function secondBefore({ date, time }: LiveNewsAnchor): LiveNewsAnchor {
    const [h, m, s] = time.split(":").map(Number);
    const t = h * 3600 + m * 60 + s - 1;
    if (t >= 0) {
        const pad = (n: number): string => String(n).padStart(2, "0");
        return { date, time: `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}` };
    }
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return { date: d.toLocaleDateString("en-CA"), time: "23:59:59" };
}

/** 실시간 피드 — KIS 앵커 되감기. 검색날짜가 오늘이면 최신부터, 과거면 그 날 23:59:59 이하부터. */
function useLiveFeed(args: { code: string; date: string; keyword: string; mode: NewsMode; enabled: boolean }): Feed {
    const { code, date, keyword, mode, enabled } = args;
    const stock = mode === "stock";
    const key: QueryKey = ["news-live", stock ? code : "", date, keyword];
    const q = useInfiniteQuery({
        queryKey: key,
        initialPageParam: (date === kstToday() ? null : { date, time: "23:59:59" }) as LiveNewsAnchor | null,
        queryFn: ({ pageParam, signal }) =>
            fetchLiveNews({ code: stock ? code : undefined, q: keyword || undefined, before: pageParam ?? undefined }, signal),
        getNextPageParam: (lastPage, _all, lastPageParam) => {
            if (lastPage.length === 0) return undefined; // KIS 과거 소진
            const oldest = lastPage[lastPage.length - 1];
            const anchor = { date: oldest.date, time: oldest.time };
            if (lastPageParam && anchor.date === lastPageParam.date && anchor.time === lastPageParam.time) return secondBefore(anchor);
            return anchor;
        },
        enabled,
        staleTime: Infinity,
    });
    const items = useMemo(() => dedupPages(q.data?.pages), [q.data]);
    return { q, items, key };
}

export function NewsPanel({ plane }: { plane: NewsPlane }): JSX.Element {
    const live = plane === "live";
    // 플레인별 버스 — 셀렉터가 plane 상수로 갈라져 다른 플레인 상태엔 구독하지 않는다.
    const focusCode = useWorkbench((s) => (live ? s.liveFocus.code : s.focus.code));
    const focusTime = useWorkbench((s) => (live ? s.liveFocus.time : s.focus.time));
    const inSearch = useWorkbench((s) => (live ? s.liveSearch != null : s.search != null));
    const code = useWorkbench((s) => (live ? s.liveFocus.code : (s.search?.code ?? s.focus.code)));
    const date = useWorkbench((s) => (live ? (s.liveSearch?.date ?? s.liveFocus.date) : (s.search?.date ?? s.focus.date)));
    const setTime = useWorkbench((s) => (live ? s.setLiveTime : s.setTime));
    const clearSearch = useWorkbench((s) => (live ? s.setLiveSearch : s.setSearch)) as (v: null) => void;
    const engine = useWorkbench((s) => s.newsSearchEngine);
    const setEngine = useWorkbench((s) => s.setNewsSearchEngine);
    const qc = useQueryClient();
    const listRef = useRef<HTMLDivElement | null>(null);
    const selfSet = useRef(false);
    const scrolledForRef = useRef<string | null>(null); // 이 (date,focus.time) 로 이미 스크롤했나 — 페이징 재실행 시 재스크롤 방지
    const rafRef = useRef(0);
    const [visibleDate, setVisibleDate] = useState(date);
    const [mode, setMode] = useState<NewsMode>("stock");
    const [input, setInput] = useState(""); // 키워드 입력(미확정)
    const [keyword, setKeyword] = useState(""); // 확정 키워드(Enter) — 쿼리키 반영

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)

    const ready = date.length > 0 && (mode === "all" || code.length > 0);
    const replayFeed = useReplayFeed({ code, date, keyword, mode, enabled: !live && ready });
    const liveFeed = useLiveFeed({ code, date, keyword, mode, enabled: live && ready });
    const { q, items, key } = live ? liveFeed : replayFeed;

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
        const scrollKey = focusTime ? `${date}|${focusTime}` : null;
        if (selfSet.current) {
            selfSet.current = false;
            scrolledForRef.current = scrollKey; // 내가 세팅한 시각 → 스크롤 불필요, 완료로 표시
            return;
        }
        if (inSearch || !focusTime) return;
        if (scrolledForRef.current === scrollKey) return; // 이 시각으로 이미 스크롤(페이징 재실행 무시)
        const container = listRef.current;
        if (!container) return;
        const today = items.filter((it) => it.date === date);
        if (today.length === 0) return; // 아직 미도착 → items 변경 때 재시도
        const target = today.find((it) => it.time <= focusTime) ?? today[today.length - 1];
        container.querySelector(`[data-srno="${target.srno}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        scrolledForRef.current = scrollKey;
    }, [focusTime, date, items, inSearch]);

    const refresh = (): void => {
        void qc.resetQueries({ queryKey: key });
    };
    const pick = (it: HtsNewsItem): void => {
        if (inSearch || it.date !== date || it.time === focusTime) return;
        selfSet.current = true;
        setTime(it.time);
    };
    const commitKeyword = (): void => setKeyword(input.trim());

    const stockMode = mode === "stock";
    if (stockMode && !focusCode) return <Center text="종목을 선택하세요" />;

    const canLoadMore = q.hasNextPage && !q.isFetchingNextPage;
    // 하이라이트 — 종목 모드는 종목명, 키워드가 있으면 키워드도(전체 모드는 키워드만).
    const hlTokens = [stockMode ? name : null, keyword || null].filter((t): t is string => !!t);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 2줄 — 1: 모드·종목명·키워드·아이콘 / 2: 현재 날짜·건수 */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 6, padding: "5px 10px", overflow: "hidden" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: `var(--plane-${live ? "live" : "eod"})`, flexShrink: 0 }} title={live ? "실시간 플레인" : "복기 플레인"} />
                    <ModeSegment mode={mode} setMode={setMode} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flexShrink: 1 }}>
                        {stockMode ? (name ?? code) : "시황 전체"}
                    </span>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commitKeyword();
                            else if (e.key === "Escape") setInput(keyword);
                        }}
                        onBlur={() => setInput(keyword)}
                        placeholder="키워드"
                        title="제목 키워드 — Enter 로 검색, 비우고 Enter 로 해제"
                        style={{
                            width: 88,
                            flexShrink: 0,
                            fontSize: 12,
                            padding: "1px 4px",
                            color: "var(--text-primary)",
                            background: "transparent",
                            border: "none",
                            borderBottom: `1px solid ${keyword ? "var(--accent-primary)" : "var(--border-default)"}`,
                            outline: "none",
                        }}
                    />
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                        {inSearch && (
                            <IconButton onClick={() => clearSearch(null)} title={live ? "기준일로 복귀" : "검색 모드 해제 — Focus 로 돌아가기"}>
                                <BackIcon />
                            </IconButton>
                        )}
                        <EngineToggle engine={engine} onToggle={() => setEngine(engine === "naver" ? "google" : "naver")} />
                        <IconButton onClick={refresh} title="새로고침 — 처음부터 다시 보기">
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
                {!q.isLoading && !q.isError && items.length === 0 && <Center text={stockMode && !keyword ? "당일 뉴스 없음" : "결과 없음"} />}
                <NewsList items={items} focusDate={date} focusTime={focusTime} timeInteractive={!inSearch} hlTokens={hlTokens} engine={engine} onPick={pick} />
            </div>
        </div>
    );
}

// 모드 세그먼트 — 보드 컨트롤과 같은 가벼운 텍스트 스타일(테두리·채움 없음). 텔레그램 패널과 공용.
function segBtn(active: boolean): React.CSSProperties {
    return {
        border: "none",
        background: "none",
        padding: "0 3px",
        cursor: "pointer",
        font: "inherit",
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
    };
}

export function ModeSegment({ mode, setMode, allTitle }: { mode: NewsMode; setMode: (m: NewsMode) => void; allTitle?: string }): JSX.Element {
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            <button style={segBtn(mode === "stock")} onClick={() => setMode("stock")} title="포커스 종목 뉴스">종목</button>
            <span style={{ color: "var(--border-default)" }}>·</span>
            <button style={segBtn(mode === "all")} onClick={() => setMode("all")} title={allTitle ?? "전체 시황 뉴스(종목 무시)"}>전체</button>
        </span>
    );
}

function NewsList({
    items,
    focusDate,
    focusTime,
    timeInteractive,
    hlTokens,
    engine,
    onPick,
}: {
    items: HtsNewsItem[];
    focusDate: string;
    focusTime: string | null;
    timeInteractive: boolean;
    hlTokens: string[];
    engine: NewsSearchEngine;
    onPick: (it: HtsNewsItem) => void;
}): JSX.Element {
    const isGoogle = engine === "google";
    const hlRe = useMemo(
        () => (hlTokens.length ? new RegExp(`(${hlTokens.map(escapeRegExp).join("|")})`, "gi") : null),
        [hlTokens],
    );
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
                                    {highlight(it.title, hlRe)}
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

// 제목에서 종목명/키워드를 solid teal 칩(.tg-hl)으로 강조. 좌우탐색 없음(단순 시각 강조). re 없으면 원문.
function highlight(title: string, re: RegExp | null): ReactNode[] {
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
