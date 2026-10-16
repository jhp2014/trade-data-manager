// HTS뉴스 패널 — 경로의 날짜(그리고 종목) 기준 HTS 헤드라인, 최신순. 범위 = 종목(경로의 종목) / 전체 시황.
// 경로에 시각이 있으면 그보다 나중 뉴스(그 시각에는 몰랐을 사후 정보)를 흐리게 하고 경계에 구분선을 둔다 —
// 지우지는 않는다(결과를 이해하는 데는 본다). 같은 날짜의 뉴스 줄 클릭 = 경로의 시각을 그 뉴스의 분으로.
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePanelPath } from "../store/paths.js";
import { usePanelUi, usePanelUiText } from "../store/panelUi.js";
import { useStockName } from "../market/queries.js";
import type { HtsNewsItem } from "../market/types.js";
import { useHtsNewsFeed } from "../news/htsFeed.js";
import { isAfterPath } from "../lib/pathTime.js";
import { dateLabel } from "../lib/date.js";
import { highlightRe } from "../lib/text.js";
import { Highlighted } from "../ui/Highlighted.js";
import { Center } from "../ui/chrome.js";
import { usePanelHeader } from "../header/registry.js";

type Scope = "stock" | "all";
const SCOPE_VALUES: readonly { v: Scope; label: string }[] = [
    { v: "stock", label: "종목" },
    { v: "all", label: "전체 시황" },
];
const SCOPES = SCOPE_VALUES.map((o) => o.v);

export function HtsNewsPanel({ panelId }: { panelId: string }): JSX.Element {
    const { path, write } = usePanelPath(panelId);
    const { code, date, time } = path.s;
    const [scope, setScope] = usePanelUi(panelId, "scope", SCOPES, "stock");
    const name = useStockName(code);
    // Enter 로 확정한 검색어 — 요청에 실린다. 패널 설정에 둬서 최소화했다 되살리거나 화면을 불러와도 남는다(범위와 같이).
    // 치는 중인 글자는 검색칸(헤더 search 컨트롤)이 들고, Enter 없이 떠나면 이 확정값으로 돌아간다.
    const [keyword, setKeyword] = usePanelUiText(panelId, "keyword");
    const stockScope = scope === "stock";
    const feedCode = stockScope ? code : "";
    const { q, items } = useHtsNewsFeed({ code: feedCode, date, keyword, enabled: date !== "" && (!stockScope || code !== "") });

    // 제목 강조 — 종목 범위면 종목명, 검색어가 있으면 검색어도.
    const hlRe = useMemo(() => highlightRe([stockScope ? name : null, keyword]), [stockScope, name, keyword]);

    // 경계 = 경로 시각 이후가 아닌 첫 줄 앞(최신순이라 사후 뉴스는 위에 모인다). 전부 나중이면 맨 끝.
    // 나중 뉴스가 하나도 없으면(firstKnown 0) 경계선을 긋지 않는다 — 위에 아무것도 없는 "이후" 선은 거짓말이다.
    const firstKnown = time ? items.findIndex((it) => !isAfterPath(it.date, it.time, date, time)) : -1;
    const boundary = !time || items.length === 0 || firstKnown === 0 ? -1 : firstKnown < 0 ? items.length : firstKnown;

    // 경로의 시각이 바깥에서 바뀌면(차트 분봉 클릭 등) 경계가 보이게 스크롤한다 — 사후 뉴스가 위에 쌓여 경계가 화면 밖일 수 있다.
    // 항목이 늦게 와도 맞추게 매 렌더 다시 보되, 같은 (피드, 시각)은 한 번만 — "더 가져오기"로 목록이 늘 때 다시 끌려가지 않게.
    const boundaryRef = useRef<HTMLDivElement | null>(null);
    const scrolledFor = useRef<string | null>(null);
    const scrollKey = (t: string): string => `${feedCode}|${date}|${keyword}|${t}`;
    useEffect(() => {
        if (!boundaryRef.current || scrolledFor.current === scrollKey(time)) return;
        scrolledFor.current = scrollKey(time);
        boundaryRef.current.scrollIntoView({ block: "center" });
    });

    const pick = (it: HtsNewsItem): void => {
        const hm = it.time.slice(0, 5);
        if (it.date !== date || hm === time) return;
        scrolledFor.current = scrollKey(hm); // 누른 줄은 이미 보고 있는 자리 — 스크롤로 끌고 가지 않는다
        write({ time: hm });
    };

    usePanelHeader(panelId, {
        info: [
            { id: "subject", name: "대상", text: () => (stockScope ? (name ? `${name} ${code}` : code || null) : "전체 시황") },
            { id: "when", name: "날짜·시각", tabular: true, text: () => (date ? `${dateLabel(date)}${time ? ` ${time}` : ""}` : null) },
            { id: "count", name: "건수", tabular: true, text: () => (items.length > 0 ? `${items.length}건` : null) },
        ],
        controls: [
            {
                // 검색은 이 패널의 본업이라 기본으로 헤더 줄에 선다(판에서 넣을 수 있다).
                kind: "search", id: "keyword", name: "제목 키워드", defaultPlace: "line", width: 96,
                help: "제목 키워드 — Enter 로 검색, 비우고 Enter 로 해제", placeholder: "제목 키워드",
                value: keyword, submit: (v) => setKeyword(v.trim()), active: keyword !== "",
            },
            { kind: "choice", id: "scope", name: "범위", help: "종목 = 경로 종목의 뉴스 · 전체 시황 = 종목 무관", values: SCOPE_VALUES, value: scope, set: (v) => setScope(v as Scope) },
        ],
    });

    let body: ReactNode;
    if (!date) body = <Center>경로 {path.id} 에 날짜를 넣으세요.</Center>;
    else if (stockScope && !code) body = <Center>경로 {path.id} 에 종목을 넣으세요 — 또는 '전체 시황'으로 보기.</Center>;
    else if (q.isError) body = <Center>뉴스 오류: {q.error.message}</Center>;
    else if (q.isPending) body = <Center>불러오는 중…</Center>;
    else {
        const afterLine = (
            <div ref={boundaryRef} className="tabular" style={{ padding: "2px 8px", fontSize: 11, color: "var(--accent-primary)", borderTop: "1px dashed var(--accent-primary)" }}>
                ↑ 경로 시각 {time} 이후
            </div>
        );
        body = (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {items.length === 0 && <div style={{ padding: "12px 8px", color: "var(--text-3)", fontSize: 12 }}>{stockScope && !keyword ? "그 날 뉴스 없음" : "결과 없음"}</div>}
                {items.map((it, i) => {
                    const sameDate = it.date === date;
                    const after = isAfterPath(it.date, it.time, date, time);
                    return (
                        <Fragment key={`${it.date}|${it.srno}`}>
                            {i === boundary && afterLine}
                            {(i === 0 || items[i - 1].date !== it.date) && (
                                <div className="tabular" style={{ padding: "2px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", background: "var(--hover)" }}>
                                    {dateLabel(it.date)}
                                </div>
                            )}
                            <div
                                data-after={after || undefined}
                                onClick={sameDate ? () => pick(it) : undefined}
                                title={sameDate ? `경로 시각을 ${it.time.slice(0, 5)} 로` : undefined}
                                style={{
                                    display: "flex", gap: 8, padding: "4px 8px", borderBottom: "1px solid var(--border)", fontSize: 12, lineHeight: 1.4,
                                    cursor: sameDate ? "pointer" : "default", opacity: after ? 0.4 : 1,
                                }}
                            >
                                <span className="tabular" style={{ flexShrink: 0, width: 36, color: sameDate ? "var(--accent-primary)" : "var(--text-3)" }}>{it.time.slice(0, 5)}</span>
                                <span style={{ flex: 1, minWidth: 0 }}><Highlighted text={cleanTitle(it.title)} re={hlRe} /></span>
                                {it.sourceName && <span style={{ flexShrink: 0, fontSize: 11, color: "var(--text-3)" }}>{it.sourceName}</span>}
                            </div>
                        </Fragment>
                    );
                })}
                {boundary === items.length && afterLine}
                {q.hasNextPage && (
                    <button
                        onClick={() => void q.fetchNextPage()}
                        disabled={q.isFetchingNextPage}
                        style={{ display: "block", width: "100%", padding: "6px 0", border: "none", background: "transparent", color: "var(--text-2)", fontSize: 12, cursor: "pointer" }}
                    >
                        {q.isFetchingNextPage ? "불러오는 중…" : "더 가져오기"}
                    </button>
                )}
            </div>
        );
    }

    return <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)" }}>{body}</div>;
}

/** 원본 제목에 섞인 제어문자(U+001A — 가운뎃점 등이 깨진 자리)를 가운뎃점으로 — 그대로 두면 앞뒤 낱말이 붙어 보인다. */
const cleanTitle = (t: string): string => t.replace(/\u001a/g, "·");
