// 텔레그램 패널 — 등록한 방 전체의 메시지, 최신순. **아카이브(tdm DB)만** 읽는다 — 라이브 검색은 쓰지 않는다(요청 제한).
// 경로 날짜가 바뀌면 그날 메시지를 저절로 읽고, 검색어(Enter · [검색])로 걸러 본다. 더보기 = 바로 앞 한 주씩(수집 범위에서 멈춤).
// 수집 범위 밖의 날은 "언급 없음"이 아니라 "아직 모름"이다 — 헤더가 말한다(news/telegramNews.ts coverageOf).
// 경로 시각이 있으면 그보다 나중 메시지(사후 정보)는 흐리게 하고 경계에 선을 긋는다.
import { Fragment, forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePanelPath } from "../store/paths.js";
import { useStockName } from "../market/queries.js";
import type { TelegramArchivePage, TelegramNewsItem } from "../market/types.js";
import { dateLabel, kstDateOfIso, kstHmOfIso } from "../lib/date.js";
import { highlightRe } from "../lib/text.js";
import { Highlighted } from "../ui/Highlighted.js";
import { Center } from "../ui/chrome.js";
import { usePanelHeader } from "../header/registry.js";
import { useTelegramFeed } from "../news/telegramFeed.js";
import { usePanelUiStore, usePanelUiText } from "../store/panelUi.js";
import { coverageLabel, coverageOf, nextWindow, previewHits, telegramItems, telegramLaterCount, type CoverageState } from "../news/telegramNews.js";

const btn: CSSProperties = { border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", padding: "1px 8px", fontSize: 11, cursor: "pointer" };

export function TelegramPanel({ panelId }: { panelId: string }): JSX.Element {
    const { path } = usePanelPath(panelId);
    const { code, date, time } = path.s;
    const name = useStockName(code);
    // 확정한 검색어(걸러 보기)와 치는 중인 글자 — 둘 다 패널 설정에 둬서 최소화했다 되살리거나 화면을 불러와도 남는다.
    // 옛 설정(라이브 검색 시절의 확정 검색 { q, date })이 남아 있으면 그 검색어로 이어 간다.
    const legacy = usePanelUiStore((st) => st.ui[panelId]?.telegramSearch);
    const legacyQ = typeof legacy === "object" && legacy !== null && typeof (legacy as { q?: unknown }).q === "string" ? (legacy as { q: string }).q : "";
    const [q, setQ] = usePanelUiText(panelId, "telegramQ", legacyQ);
    const [draft, setDraft] = usePanelUiText(panelId, "telegramDraft", q);
    const feed = useTelegramFeed(date, q);

    const pages = feed.data?.pages;
    const items = useMemo(() => telegramItems(pages?.map((p) => p.page)), [pages]);
    const coverage = pages?.[pages.length - 1]?.page.coverage;
    const cov = coverage === undefined ? null : coverageOf(date, coverage);
    // 수집 범위 앞의 날이라도 메시지가 있으면 "일부 방만" — 검색어로 걸러 비었으면 모른다.
    const seen = pages?.[0]?.page.items.length ? "some" : q ? "unknown" : "none";
    const words = useMemo(() => q.split(/\s+/).filter(Boolean), [q]);
    const hlRe = useMemo(() => highlightRe(words), [words]);
    // 사후 정보 경계 — 지금 경로의 (날짜, 시각) 기준(HTS뉴스와 같은 판정, lib/pathTime).
    const laterN = time ? telegramLaterCount(items, date, time) : 0;

    usePanelHeader(panelId, {
        info: [
            {
                id: "result", name: "보는 것", tabular: true, help: "검색어(없으면 전체) · 경로 날짜 · 건수(더보기로 받은 지난 날 포함)",
                text: () => (date ? `${q ? `"${q}"` : "전체"} · ${dateLabel(date)}${feed.data ? ` · ${items.length}건` : ""}` : "날짜 없음"),
            },
            {
                // 빈 결과를 "언급 없음"으로 믿지 않게 — 그 날짜가 수집 범위 밖이면 경고로.
                id: "coverage", name: "수집 범위", help: "텔레그램 아카이브(tdm DB)에 그 날짜가 9개 방 모두 빠짐없이 들었나",
                tone: cov && cov.kind !== "ok" ? "warn" : undefined,
                text: () => (cov ? coverageLabel(cov, seen) : null),
            },
        ],
        controls: [
            {
                // 입력칸 + [검색] 이 한 컨트롤 — 확정하면 그 검색어로 걸러 다시 읽는다(DB 라 몇 번이든 괜찮다). 비우면 전체.
                kind: "search", id: "search", name: "검색어", defaultPlace: "line", width: 160, button: "검색",
                help: "검색어로 걸러 보기 — 공백으로 가른 낱말 전부가 본문 또는 링크 미리보기(제목·설명)에 든 메시지. 비우면 그날 전체",
                placeholder: "검색어 — 비우면 전체",
                value: draft, onDraft: setDraft, canSubmit: date !== "", active: q !== "",
                submit: (v) => setQ(v.trim()),
            },
            {
                kind: "action", id: "fillName", name: "종목명으로", disabled: !name,
                help: name ? `"${name}" 으로 걸러 보기` : "경로에 종목이 없습니다",
                run: () => {
                    if (!name) return;
                    setDraft(name);
                    setQ(name);
                },
            },
        ],
    });

    // 경로 시각이 바뀌면 경계가 보이게 스크롤한다 — 사후 메시지가 위에 쌓여 경계가 화면 밖일 수 있다(HTS뉴스와 같다).
    // 같은 (검색어, 경로)에는 한 번만 — "더보기"로 목록이 늘 때 다시 끌려가지 않게.
    const boundaryRef = useRef<HTMLDivElement | null>(null);
    const scrolledFor = useRef<string | null>(null);
    const scrollKey = `${q}|${date}|${time}`;
    useEffect(() => {
        if (!boundaryRef.current || scrolledFor.current === scrollKey) return;
        scrolledFor.current = scrollKey;
        boundaryRef.current.scrollIntoView({ block: "center" });
    });

    let body: ReactNode;
    if (!date) body = <Center>경로 {path.id} 에 날짜를 넣으세요.</Center>;
    else if (!feed.data) {
        if (feed.isError) body = <Center>텔레그램 아카이브 오류: {feed.error.message}</Center>;
        else body = <Center>{date} 텔레그램 불러오는 중…</Center>;
    } else {
        const last = pages![pages!.length - 1];
        const next = feed.hasNextPage ? nextWindow(last.window, last.page, last.page.coverage) : undefined;
        body = (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {items.length === 0 && (
                    <div style={{ padding: "12px 10px", color: "var(--text-3)", fontSize: 12 }}>
                        {emptyText(date, q, cov)}
                    </div>
                )}
                {items.map((it, i) => (
                    <Fragment key={it.ref}>
                        {i === laterN && laterN > 0 && <LaterDivider time={time} ref={boundaryRef} />}
                        {(i === 0 || kstDateOfIso(items[i - 1].at) !== kstDateOfIso(it.at)) && <DateDivider date={kstDateOfIso(it.at)} />}
                        <TelegramRow it={it} words={words} re={hlRe} later={i < laterN} />
                    </Fragment>
                ))}
                {laterN > 0 && laterN === items.length && <LaterDivider time={time} ref={boundaryRef} />}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", fontSize: 11, color: "var(--text-3)" }}>
                    {feed.isFetchNextPageError && <span style={{ color: "var(--rise)" }}>더보기 실패: {feed.error?.message}</span>}
                    {next ? (
                        <button style={btn} onClick={() => void feed.fetchNextPage({ cancelRefetch: false })} disabled={feed.isFetchingNextPage}>
                            {feed.isFetchingNextPage ? "불러오는 중…" : next.before ? `더보기 (${last.window.from === last.window.to ? last.window.from : `${last.window.from}~${last.window.to}`} 이어서)` : `더보기 (${last.window.from} 이전 한 주)`}
                        </button>
                    ) : (
                        <span>{endText(cov, last.page.coverage)}</span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
            {body}
        </div>
    );
}

/** 빈 결과 문구 — 수집 범위 밖 · 일부만 든 날을 "메시지 없음"으로 말하지 않는다. */
function emptyText(date: string, q: string, cov: CoverageState | null): string {
    const what = `${date} ${q ? `"${q}" ` : ""}메시지 없음`;
    if (!cov || cov.kind === "ok") return what;
    if (cov.kind === "partial") return `${what} — ${coverageLabel(cov)}`;
    return `${date} — 아직 수집 안 된 날짜라 비어 있을 수 있습니다`;
}

/** 더 거슬러 갈 수 없을 때 — 왜 멈췄는지. */
function endText(cov: CoverageState | null, coverage: TelegramArchivePage["coverage"]): string {
    if (!coverage) return "수집 범위를 몰라 더 거슬러 가지 않습니다";
    if (cov?.kind === "before") return "빠짐없는 수집 범위 앞이라 더 거슬러 가지 않습니다";
    return `빠짐없는 수집의 시작(${kstDateOfIso(coverage.from)} ${kstHmOfIso(coverage.from)})까지 봤습니다 — 그 앞은 일부 방만 있거나 수집 전`;
}

function DateDivider({ date }: { date: string }): JSX.Element {
    return (
        <div className="tabular" style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-3)", background: "var(--bg-secondary)" }}>
            {dateLabel(date)}
        </div>
    );
}

/** 사후 정보 경계 — 최신순이라 이 선 위가 경로 시각보다 나중 메시지다. */
const LaterDivider = forwardRef<HTMLDivElement, { time: string }>(function LaterDivider({ time }, ref) {
    return (
        <div ref={ref} data-later-divider style={{ padding: "2px 10px", fontSize: 11, fontWeight: 600, color: "var(--accent-hover)", background: "var(--accent-soft)", borderTop: "1px dashed var(--accent-primary)" }}>
            ▲ 경로 시각 {time} 이후
        </div>
    );
});

/** 긴 본문은 접어 둔다 — 한 메시지가 목록을 다 차지하지 않게. */
const isLong = (text: string): boolean => text.length > 280 || text.split("\n").length > 6;

function TelegramRow({ it, words, re, later }: { it: TelegramNewsItem; words: readonly string[]; re: RegExp | null; later: boolean }): JSX.Element {
    const [open, setOpen] = useState(false);
    // 검색어가 본문엔 없고 링크 미리보기에서 맞았으면 그 글을 작게 — 왜 잡혔는지 보이게.
    const pv = useMemo(() => previewHits(it, words), [it, words]);
    const long = isLong(it.text);
    const clamp: CSSProperties = long && !open ? { display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" } : {};
    return (
        <div data-ref={it.ref} data-later={later || undefined} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-subtle)", opacity: later ? 0.45 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span className="tabular" style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "var(--accent-primary)" }}>
                    {kstHmOfIso(it.at)}
                </span>
                <span style={{ minWidth: 0, fontSize: 10, color: "var(--text-3)", padding: "0 6px", background: "var(--bg-secondary)", borderRadius: 999, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.channel}
                </span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word", ...clamp }}>
                <Highlighted text={it.text} re={re} />
            </div>
            {pv && (
                <div data-preview style={{ marginTop: 3, padding: "2px 0 2px 8px", borderLeft: "2px solid var(--border-subtle)", fontSize: 11, lineHeight: 1.4, color: "var(--text-2)", wordBreak: "break-word" }}>
                    <span style={{ fontSize: 10, color: "var(--text-3)", marginRight: 4 }}>미리보기</span>
                    {pv.title && (
                        <span style={{ fontWeight: 600 }}>
                            <Highlighted text={pv.title} re={re} />
                        </span>
                    )}
                    {pv.description && (
                        <div style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            <Highlighted text={pv.description} re={re} />
                        </div>
                    )}
                </div>
            )}
            {(long || it.url) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 11 }}>
                    {long && (
                        <button onClick={() => setOpen((o) => !o)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "var(--text-3)", fontSize: 11 }}>
                            {open ? "접기" : "펼치기"}
                        </button>
                    )}
                    {it.url && (
                        <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ minWidth: 0, color: "var(--accent-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {hostOf(it.url)}
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url.slice(0, 40);
    }
}
