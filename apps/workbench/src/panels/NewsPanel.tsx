import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQueryClient, type UseInfiniteQueryResult, type QueryKey } from "@tanstack/react-query";
import { useWorkbench, type NewsSearchEngine } from "../store/workbench.js";
import { usePlaneBus, type Plane } from "../store/usePlaneBus.js";
import { fetchHtsNews, type HtsNewsItem, type HeadlineCursor } from "../api/news.js";
import { fetchLiveNews, type LiveNewsAnchor } from "../api/liveNews.js";
import { useStockName } from "../lib/useStockName.js";
import { dateLabel, kstToday } from "../lib/date.js";
import { escapeRegExp } from "../lib/text.js";
import { ChevronDownIcon, BackIcon } from "../components/icons.js";
import { PlaneDot } from "../components/PlaneDot.js";
import {
    DateDivider,
    ModeSegment,
    NewsCenter,
    dedupPages,
    highlightMatches,
    useTopVisible,
    type NewsMode,
} from "../components/news/newsShared.js";
import { liveNextCursor, replayNextCursor } from "../components/news/newsCursor.js";
import { PanelHeader } from "../components/ControlChrome.js";

// 뉴스 패널(양 플레인 공통) — HTS(시황) 헤드라인을 최신순으로. plane 이 버스·소스를 고른다:
//  · replay = 복기 버스(focus/search) + DB(/api/news/hts, 커서 (date,srno) 엄격미만)
//  · live   = 실시간 버스(liveFocus/liveSearch) + KIS 온디맨드(/live/news, 앵커 (date,time) ≤ 되감기 + srno dedup)
// 모드 = 종목(code+검색날짜 추종) / 전체(시황, code 무시). 키워드 = 있으면 제목 검색, 없으면 기본 피드.
// 검색 모드(일봉 봉 클릭)면 그 날짜를 따라가고(뱃지/↺ 로 해제) time 상호작용 off. 헤더 2줄.
// 본문 시각 3계층(당일·장중이전/당일/과거) + 제목 하이라이트(종목명 또는 키워드).
const PAGE = 30;
const INTRADAY_FILL = "rgba(22,121,111,0.14)"; // 현재시간 이전(장중 참고가능) 시각 셀 채움 — --accent-primary 틴트

interface Feed {
    q: UseInfiniteQueryResult<unknown>;
    items: HtsNewsItem[];
    key: QueryKey;
}

/** srno dedup 평탄화(최신순 유지). live 앵커(≤ 포함) 경계 중복 흡수, replay 는 무해. */
const flatten = (pages: HtsNewsItem[][] | undefined): HtsNewsItem[] => dedupPages(pages, (it) => it.srno);

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
        // 전진 규칙은 newsCursor(순수·테스트) — "그 날 전체" 첫 페이지만 길이 무관 계속.
        getNextPageParam: (lastPage, allPages) =>
            replayNextCursor(lastPage, allPages, { date, dayInitial: stock && !keyword && allPages.length === 1, pageSize: PAGE }),
        enabled,
        staleTime: Infinity,
    });
    const items = useMemo(() => flatten(q.data?.pages), [q.data]);
    return { q, items, key };
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
        // 전진 규칙은 newsCursor(순수·테스트) — 같은 초에 몰려 앵커가 안 움직이면 1초 뒤로 강제 전진.
        getNextPageParam: (lastPage, _all, lastPageParam) => liveNextCursor(lastPage, lastPageParam),
        enabled,
        staleTime: Infinity,
    });
    const items = useMemo(() => flatten(q.data?.pages), [q.data]);
    return { q, items, key };
}

export function NewsPanel({ plane }: { plane: Plane }): JSX.Element {
    const { live, code, viewDate: date, time: focusTime, inSearch, setTime, clearSearch } = usePlaneBus(plane);
    const engine = useWorkbench((s) => s.newsSearchEngine);
    const setEngine = useWorkbench((s) => s.setNewsSearchEngine);
    const qc = useQueryClient();
    const listRef = useRef<HTMLDivElement | null>(null);
    const selfSet = useRef(false);
    const scrolledForRef = useRef<string | null>(null); // 이 (date,focus.time) 로 이미 스크롤했나 — 페이징 재실행 시 재스크롤 방지
    const [mode, setMode] = useState<NewsMode>("stock");
    const [input, setInput] = useState(""); // 키워드 입력(미확정)
    const [keyword, setKeyword] = useState(""); // 확정 키워드(Enter) — 쿼리키 반영

    const name = useStockName(code); // 마스터 메타 경량 조회(code 키·날짜무관)

    const ready = date.length > 0 && (mode === "all" || code.length > 0);
    const replayFeed = useReplayFeed({ code, date, keyword, mode, enabled: !live && ready });
    const liveFeed = useLiveFeed({ code, date, keyword, mode, enabled: live && ready });
    const { q, items, key } = live ? liveFeed : replayFeed;

    // 헤더 2줄의 "지금 보는 날짜" — 스크롤 최상단 구분선. 날짜가 바뀌면 초기화해 새 날짜를 보여준다.
    const topDate = useTopVisible(listRef, "date");
    const visibleDate = topDate.current ?? date;
    const { reset: resetTopDate } = topDate;
    useEffect(() => resetTopDate(), [date, resetTopDate]);

    const visibleCount = useMemo(() => items.filter((it) => it.date === visibleDate).length, [items, visibleDate]);

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
    const noStock = stockMode && !code; // 종목 미선택 — 헤더(모드 전환)는 살리고 본문만 안내
    const canLoadMore = q.hasNextPage && !q.isFetchingNextPage;
    // 하이라이트 — 종목 모드는 종목명, 키워드가 있으면 키워드도(전체 모드는 키워드만).
    const hlTokens = [stockMode ? name : null, keyword || null].filter((t): t is string => !!t);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 2줄 — 1: 모드·종목명·키워드·아이콘 / 2: 현재 날짜·건수 */}
            <div style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", flexShrink: 0 }}>
                <PanelHeader chrome={false} gap={6} padding="5px 10px">
                    <PlaneDot plane={plane} />
                    <ModeSegment mode={mode} setMode={setMode} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: noStock ? "var(--text-tertiary)" : "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flexShrink: 1 }}>
                        {stockMode ? (name ?? (code || "종목 미선택")) : "시황 전체"}
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
                            <IconButton onClick={clearSearch} title={live ? "기준일로 복귀" : "검색 모드 해제 — Focus 로 돌아가기"}>
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
                </PanelHeader>
                <PanelHeader chrome={false} gap={8} padding="0 10px 5px" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                    <span className="tabular" style={{ flexShrink: 0 }}>{dateLabel(visibleDate)}</span>
                    {visibleCount > 0 && <span className="tabular" style={{ flexShrink: 0 }}>{visibleCount}건</span>}
                </PanelHeader>
            </div>

            {/* 본문 */}
            <div ref={listRef} onScroll={topDate.onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {noStock ? (
                    <NewsCenter>종목을 선택하세요 — 또는 '전체'로 시황 전체 보기</NewsCenter>
                ) : (
                    <>
                        {q.isLoading && <NewsCenter>로딩중…</NewsCenter>}
                        {q.isError && <NewsCenter>오류: {(q.error as Error).message}</NewsCenter>}
                        {!q.isLoading && !q.isError && items.length === 0 && <NewsCenter>{stockMode && !keyword ? "당일 뉴스 없음" : "결과 없음"}</NewsCenter>}
                        <NewsList items={items} focusDate={date} focusTime={focusTime} timeInteractive={!inSearch} hlTokens={hlTokens} engine={engine} onPick={pick} />
                    </>
                )}
            </div>
        </div>
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
                        {showDate && <DateDivider date={it.date} label={dateLabel(it.date)} />}
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
                                    {highlightMatches(it.title, hlRe)}
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
