import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkbench, type NewsSearchEngine } from "../store/workbench.js";
import { fetchHtsNews, type HtsNewsItem, type HeadlineCursor } from "../api/news.js";
import { fetchDaySummary } from "../api/daySummary.js";

// HTS(시황) 뉴스 패널 — 선택 종목(focus.code)의 그 날(focus.date) 헤드라인을 최신순으로.
// 헤더=종목명 + 새로고침(당일만 다시)·과거 더 보기 버튼. 본문은 3계층으로 구분:
//   · 당일 & time ≤ focus.time : 장중 그 시점에 참고 가능했던 이슈(왼쪽 액센트 바 + 틴트 강조)
//   · 당일 그 외               : 당일 이슈(시각 액센트색)
//   · 과거 날짜                : 히스토리(시각 muted, 클릭 비활성)
// 당일 행 클릭 → focus.time 을 그 시각으로 이동(당일 안에서만). Telegram 과는 별개 패널.
const PAGE = 30;
const INTRADAY_FILL = "rgba(22,121,111,0.14)"; // 현재시간 이전(장중 참고가능) 시각 셀 채움 — --accent-primary 틴트
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "YYYY-MM-DD" → "YYYY-MM-DD (요일)". 날짜만 로컬 파싱(KST 거래일 기준 요일).
function dateLabel(date: string): string {
    if (!date) return "";
    const w = WEEKDAYS[new Date(`${date}T00:00:00`).getDay()] ?? "";
    return `${date} (${w})`;
}

export function HtsNewsPanel(): JSX.Element {
    const code = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const setTime = useWorkbench((s) => s.setTime);
    const engine = useWorkbench((s) => s.newsSearchEngine);
    const setEngine = useWorkbench((s) => s.setNewsSearchEngine);
    const qc = useQueryClient();
    const listRef = useRef<HTMLDivElement | null>(null);
    const selfSet = useRef(false); // 뉴스 클릭으로 내가 time 을 바꿨을 때 = 자동 스크롤 스킵 플래그
    const rafRef = useRef(0);
    // 현재 뷰포트 최상단에 걸린 날짜 — 스크롤에 따라 갱신(in-list 구분선이 sticky 로 안 남으므로 헤더가 대신 표시).
    const [visibleDate, setVisibleDate] = useState(date);

    // 종목명 — day-summary 캐시(보드가 이미 페치)에서 조회. 추가 페치 없음.
    const summaryQ = useQuery({
        queryKey: ["day-summary", date],
        queryFn: () => fetchDaySummary(date),
        enabled: date.length > 0,
        staleTime: Infinity,
    });
    const name = summaryQ.data?.stocks.find((s) => s.stockCode === code)?.name ?? null;

    const q = useInfiniteQuery({
        queryKey: ["news-hts", code, date],
        initialPageParam: null as HeadlineCursor | null,
        queryFn: ({ pageParam }) => fetchHtsNews({ code, date, before: pageParam, limit: PAGE }),
        getNextPageParam: (lastPage, allPages) => {
            const isDayPage = allPages.length === 1; // 첫 페이지 = 당일(범위 조회, 건수 무제한)
            // 커서 페이지가 꽉 안 찼으면 더 과거 없음 → 종료. 당일 페이지엔 미적용(항상 한 번은 과거로).
            if (!isDayPage && lastPage.length < PAGE) return undefined;
            // 지금까지 로드된 것 중 가장 과거 = 마지막 항목. 그보다 엄격히 과거만 다음 페이지.
            for (let i = allPages.length - 1; i >= 0; i--) {
                const p = allPages[i];
                if (p.length > 0) {
                    const oldest = p[p.length - 1];
                    return { date: oldest.date, srno: oldest.srno };
                }
            }
            return { date, srno: "0" }; // 당일 0건 → 그 날짜 이전으로 한 번 시도(srno "0" = publishedDate < date)
        },
        enabled: code.length > 0 && date.length > 0,
        staleTime: Infinity,
    });

    const items = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
    // 헤더에 띄울 "현재 보는 날짜"의 로드된 건수.
    const visibleCount = useMemo(() => items.filter((it) => it.date === visibleDate).length, [items, visibleDate]);

    // focus.date 바뀌면 리스트가 맨 위(당일)로 리셋되므로 헤더 날짜도 그날로.
    useEffect(() => setVisibleDate(date), [date]);

    // 스크롤 시 최상단 날짜 갱신 — 날짜 구분선(divider)만 훑어(그룹당 1개, 저렴) top 위/걸친 마지막 것.
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
                else break; // 순서대로라 top 아래로 내려간 첫 구분선에서 중단
            }
            if (cur) setVisibleDate(cur);
        });
    };
    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    // focus.time 이 외부 이유(차트 클릭·시간 스크러버 등)로 바뀌면 그 시각 위치로 리스트 스크롤.
    // 뉴스 클릭으로 바뀐 건(selfSet) 스킵 — 스크롤 튐 방지. items 는 의존성에서 뺀다(과거 더보기가
    // 스크롤을 위로 되감지 않게). 당일은 항상 로드돼 있어 타깃은 로드된 집합 안에 있음.
    useEffect(() => {
        if (selfSet.current) {
            selfSet.current = false;
            return;
        }
        if (!focusTime) return;
        const container = listRef.current;
        if (!container) return;
        // 당일 items(최신순) 중 time ≤ focusTime 인 첫 항목 = 그 시점에 가장 최근 뉴스. 없으면 마지막 당일 항목.
        const today = items.filter((it) => it.date === date);
        if (today.length === 0) return;
        const target = today.find((it) => it.time <= focusTime) ?? today[today.length - 1];
        const el = container.querySelector(`[data-srno="${target.srno}"]`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, [focusTime, date]); // eslint-disable-line react-hooks/exhaustive-deps

    // 새로고침 = 페이징 리셋 → 당일 페이지만 다시 로드.
    const refresh = (): void => {
        void qc.resetQueries({ queryKey: ["news-hts", code, date] });
    };
    // 당일 행만 시각 이동(당일 안에서). 과거 날짜 행은 비활성. 이미 그 시각이면 무시(플래그 꼬임 방지).
    const pick = (it: HtsNewsItem): void => {
        if (it.date !== date || it.time === focusTime) return;
        selfSet.current = true;
        setTime(it.time);
    };

    if (!code) return <Center text="종목을 선택하세요" />;

    const canLoadMore = q.hasNextPage && !q.isFetchingNextPage;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
            {/* 헤더 — 종목명 + 새로고침·과거더보기 */}
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)", fontSize: 12, flexShrink: 0, overflow: "hidden" }}>
                {/* 종목명·건수 = flexShrink 1(폭 부족 시 먼저 클램프). 날짜·버튼 = flexShrink 0(보호). 모두 nowrap → 2줄 방지. */}
                <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flexShrink: 1 }}>{name ?? code}</span>
                <span className="tabular" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>{dateLabel(visibleDate)}</span>
                {visibleCount > 0 && <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", minWidth: 0, flexShrink: 1 }}>{visibleCount}건</span>}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <EngineToggle engine={engine} onToggle={() => setEngine(engine === "naver" ? "google" : "naver")} />
                    <IconButton onClick={refresh} title="새로고침 — 당일만 다시 보기">
                        <RefreshIcon />
                    </IconButton>
                    <IconButton onClick={() => void q.fetchNextPage()} disabled={!canLoadMore} title={q.isFetchingNextPage ? "불러오는 중…" : "과거 더 보기 — 그 날부터 과거로"}>
                        <ChevronDownIcon />
                    </IconButton>
                </div>
            </div>

            {/* 본문 */}
            <div ref={listRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {q.isLoading && <Center text="로딩중…" />}
                {q.isError && <Center text={`오류: ${(q.error as Error).message}`} />}
                {!q.isLoading && !q.isError && items.length === 0 && <Center text="당일 뉴스 없음" />}
                <NewsList items={items} focusDate={date} focusTime={focusTime} engine={engine} onPick={pick} />
            </div>
        </div>
    );
}

// 헤드라인 리스트 — 날짜가 바뀌면 날짜 구분선. 각 행은 3계층(당일·장중이전/당일/과거)으로 시각 강조가 다름.
function NewsList({
    items,
    focusDate,
    focusTime,
    engine,
    onPick,
}: {
    items: HtsNewsItem[];
    focusDate: string;
    focusTime: string | null;
    engine: NewsSearchEngine;
    onPick: (it: HtsNewsItem) => void;
}): JSX.Element {
    const isGoogle = engine === "google";
    let prevDate = "";
    return (
        <div>
            {items.map((it) => {
                const showDate = it.date !== prevDate;
                prevDate = it.date;
                const isToday = it.date === focusDate;
                const isIntradayPast = isToday && focusTime != null && it.time <= focusTime;
                return (
                    <div key={it.srno}>
                        {showDate && (
                            <div data-date-divider data-date={it.date} className="tabular" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", background: "var(--bg-secondary)" }}>
                                {dateLabel(it.date)}
                            </div>
                        )}
                        <div
                            data-srno={it.srno}
                            style={{
                                display: "flex",
                                alignItems: "stretch", // 시각 거터가 행 높이를 꽉 채우도록
                                borderBottom: "1px solid var(--border-subtle)",
                                fontSize: 13,
                                lineHeight: 1.4,
                            }}
                        >
                            {/* 시각 거터 — 당일이면 클릭 시 그 시각으로 이동. 현재시간 이전(장중 참고가능)은 셀 배경을 꽉 채워 강조. */}
                            <span
                                className={isToday ? "tabular news-time" : "tabular"}
                                onClick={isToday ? () => onPick(it) : undefined}
                                title={isToday ? "이 시각으로 이동" : undefined}
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
                            {/* 본문 셀 — 상하 패딩은 여기서(거터는 풀필). 제목 클릭=네이버 뉴스 검색. */}
                            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, padding: "6px 10px" }}>
                                <span
                                    className="news-title"
                                    title={isGoogle ? "클릭 — 구글에서 이 제목 검색(기준일 ±2일)" : "클릭 — 네이버 뉴스에서 이 제목·날짜로 검색"}
                                    onClick={() => window.open(isGoogle ? googleUrl(it.title, it.date) : naverNewsUrl(it.title, it.date), "_blank", "noopener,noreferrer")}
                                    style={{ flex: 1, minWidth: 0, color: "var(--text-primary)" }}
                                >
                                    {it.title}
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

function IconButton({
    children,
    onClick,
    disabled,
    title,
}: {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    title?: string;
}): JSX.Element {
    return (
        <button className="icon-btn" onClick={onClick} disabled={disabled} title={title}>
            {children}
        </button>
    );
}

// 새로고침(rotate-cw) — 당일만 다시.
function RefreshIcon(): JSX.Element {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
    );
}

// 과거 더 보기 — 아코디언 느낌의 아래 chevron.
function ChevronDownIcon(): JSX.Element {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

// 네이버 뉴스 검색 URL — 제목(느슨) + 그 날짜로 스코프(pd=3 기간직접, ds/de + nso from/to). 그 날 기사로 좁힘.
function naverNewsUrl(title: string, date: string): string {
    const dot = date.replace(/-/g, "."); // 2026.06.27
    const compact = date.replace(/-/g, ""); // 20260627
    const q = encodeURIComponent(title);
    return `https://search.naver.com/search.naver?where=news&query=${q}&pd=3&ds=${dot}&de=${dot}&nso=so:r,p:from${compact}to${compact},a:all`;
}

// 날짜 ± n일을 구글 tbs 용 미국식 M/D/YYYY 로. 로컬 파싱(KST 거래일 기준).
function usDateShift(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// 구글 웹 검색 URL — 제목 + 기준일 ±2일 범위(tbs=cdr). 구글은 날짜 추정이 느슨해 앞뒤 여유를 둠. 커버리지·랭킹 우세.
function googleUrl(title: string, date: string): string {
    const q = encodeURIComponent(title);
    const min = usDateShift(date, -2);
    const max = usDateShift(date, 2);
    return `https://www.google.com/search?q=${q}&tbs=cdr:1,cd_min:${min},cd_max:${max}`;
}

// 검색 엔진 전역 토글(N/G) — 새로고침 좌측. 브랜드 색으로 현재 엔진 표시, 클릭 시 전환.
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
