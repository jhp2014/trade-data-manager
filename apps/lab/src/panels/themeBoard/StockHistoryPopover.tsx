// 종목 이력 창 — 테마 패널에서 종목 줄을 우클릭하면 그 자리에 뜬다. 바깥 누름 · Esc 로 닫힌다(팝오버 스택).
//   머리: 종목명 · 코드 · 시가총액
//   장마감 정리: 그날의 주도주시황 — **장중에는 볼 수 없는 정보**라 따로 표시. 경로 시각이 장 마감 전이면 접어 둔다(누르면 펼침).
//   테마별 이력: 테마마다 몇 번 · 처음~마지막 · 세부 이름(그날 **이전** 이력)
//   이력 줄: 최근부터 — 날짜 · 등락 · 세부 이름 · 이슈(문맥)
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingSurface } from "../../ui/popover/FloatingSurface.js";
import { useCloseOnDetach } from "../../ui/popover/useFitInViewport.js";
import { CLOSE_TIME } from "../../store/paths.js";
import { useStockHistory } from "../../judgment/queries.js";
import type { Coverage, HistoryLine, StockHistory } from "../../judgment/types.js";
import { fmtEokValue, fmtPct } from "../../lib/format.js";

export function StockHistoryPopover({ code, name, marketCap, date, time, coverage, at, onClose }: {
    code: string;
    name: string;
    /** 원(문자열 — 시계열 그대로). */
    marketCap: string | null;
    date: string;
    /** 경로 시각(HH:MM, 비면 장 마감) — 장 마감 전이면 장마감 정리를 접어 둔다. */
    time: string;
    /** 이력이 덮는 기간 — "이력 없음"이 "아직 모름"인지 가른다. */
    coverage: Coverage | null;
    at: { x: number; y: number };
    onClose: () => void;
}): JSX.Element {
    // 누른 자리에 0 크기 앵커를 두고 판을 그 아래에 연다(판 자리 계산은 FloatingSurface 가 한다). 앵커는 body 에 둔다 —
    // dockview 패널의 transform 안에서는 position:fixed 가 패널 기준이 된다. 그래서 탭 전환 등으로 **패널이 떨어지면**
    // 닫히게 하는 일은 패널 안에 둔 표식(marker)이 한다(FloatingSurface 의 앵커 감시는 body 앵커라 늘 붙어 있다).
    const anchorRef = useRef<HTMLSpanElement>(null);
    const markerRef = useRef<HTMLSpanElement>(null);
    useCloseOnDetach(markerRef, onClose);
    const q = useStockHistory(code, date);
    const cap = marketCap ? fmtEokValue(Number(marketCap) / 1e8) : null;
    return (
        <>
            <span ref={markerRef} hidden />
            {createPortal(<span ref={anchorRef} style={{ position: "fixed", left: at.x, top: at.y, width: 0, height: 0 }} />, document.body)}
            <FloatingSurface anchorRef={anchorRef} place={{ side: "below", align: "start", gap: 2 }} onClose={onClose} layout="column" width={460} padding={0}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                    <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>
                    {cap && <span className="tabular" style={{ marginLeft: "auto", color: "var(--text-secondary)" }} title="시가총액">시총 {cap}</span>}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 8px" }}>
                    {q.isError ? (
                        <Note>이력 오류: {q.error.message}</Note>
                    ) : q.data === undefined ? (
                        <Note>이력 불러오는 중…</Note>
                    ) : q.data === null ? (
                        <Note>{noHistory(date, coverage)}</Note>
                    ) : (
                        <HistoryBody h={q.data} intraday={!!time && time < CLOSE_TIME} />
                    )}
                </div>
            </FloatingSurface>
        </>
    );
}

/** 이력이 없을 때 — 이력이 덮는 기간 안이면 "오른 날이 없다", 기간 앞이면 "아직 모른다". */
function noHistory(date: string, c: Coverage | null): string {
    if (c && date > c.from) return `이력 없음 — 이력(${c.from} ~ ${c.to})에 이 종목이 오른 날이 없다.`;
    return c ? `이력 범위 앞(${c.from}~)이라 아직 모른다.` : "이력이 아직 없다.";
}

/** 이력 본문 — 받은 이력만으로 그린다. intraday = 경로 시각이 장 마감 전(장마감 정리를 접어 둔다). */
export function HistoryBody({ h, intraday }: { h: StockHistory; intraday: boolean }): JSX.Element {
    const [showClosing, setShowClosing] = useState(!intraday);
    // 기준일 이전 줄이 없을 때 — 이력이 덮는 기간 앞이면 "없음"이 아니라 "아직 모름".
    const empty = h.coverage && h.asOf <= h.coverage.from ? `이력 범위 앞(${h.coverage.from}~)이라 아직 모른다.` : `${h.asOf} 이전 이력 없음`;
    return (
        <>
            {h.closing && (
                <Section
                    title="장마감 정리"
                    aside={intraday ? "장 마감 뒤 정보 — 지금 시각엔 아직 없다" : "장중엔 볼 수 없음"}
                    accent={!intraday}
                    toggle={intraday ? { open: showClosing, set: setShowClosing } : undefined}
                >
                    {showClosing && <Line l={h.closing} showReasons />}
                </Section>
            )}
            <Section title="테마별 이력" aside={`${h.asOf} 이전`}>
                {h.themes.length === 0 ? (
                    <Note>{h.lines.length === 0 ? empty : "테마로 묶인 이력 없음"}</Note>
                ) : (
                    h.themes.map((t) => (
                        <div key={t.theme} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", alignItems: "baseline", columnGap: 8, padding: "2px 12px" }}>
                            <span style={{ fontWeight: 600 }}>{t.theme}</span>
                            <span className="tabular" style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }} title={`${t.first} ~ ${t.last}`}>
                                {t.n}번 · {short(t.first)}~{short(t.last)}
                            </span>
                            <span style={{ color: "var(--text-tertiary)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.details.join(" · ")}>
                                {t.details.filter((d) => d !== t.theme).join(" · ")}
                            </span>
                        </div>
                    ))
                )}
            </Section>
            <Section title="이력" aside={`${h.lines.length}일`}>
                {h.lines.length === 0 ? <Note>{empty}</Note> : h.lines.map((l) => <Line key={l.date} l={l} />)}
            </Section>
        </>
    );
}

function Section({ title, aside, accent = false, toggle, children }: {
    title: string;
    aside?: string;
    accent?: boolean;
    /** 주면 머리를 눌러 펼치고 접는다. */
    toggle?: { open: boolean; set: (open: boolean) => void };
    children: React.ReactNode;
}): JSX.Element {
    return (
        <section style={{ marginTop: 6 }}>
            <div
                onClick={toggle ? () => toggle.set(!toggle.open) : undefined}
                title={toggle ? (toggle.open ? "접기" : "펼치기") : undefined}
                style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "2px 12px", cursor: toggle ? "pointer" : undefined }}
            >
                {toggle && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{toggle.open ? "▾" : "▸"}</span>}
                <span style={{ fontSize: 11, fontWeight: 700, color: accent ? "var(--accent-primary)" : "var(--text-secondary)" }}>{title}</span>
                {aside && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{aside}</span>}
            </div>
            {children}
        </section>
    );
}

/** 이력 한 줄 — 날짜 · 등락 · 세부 이름(칩) · 이슈. 장마감 정리는 묶음 이유(문맥)도 펼친다. */
function Line({ l, showReasons = false }: { l: HistoryLine; showReasons?: boolean }): JSX.Element {
    const up = (l.pct ?? 0) >= 0;
    return (
        <div style={{ padding: "3px 12px", borderTop: "1px solid var(--border-subtle)" }} title={showReasons ? undefined : l.reasons.join("\n")}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                <span className="tabular" style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{l.date}</span>
                {l.pct !== null && (
                    <span className="tabular" style={{ flexShrink: 0, fontWeight: 600, color: up ? "var(--rise)" : "var(--fall)" }}>
                        {fmtPct(l.pct, 2)}
                        {l.limitUp ? " 상" : ""}
                    </span>
                )}
                <span style={{ display: "inline-flex", gap: 3, minWidth: 0, overflow: "hidden" }} title={l.details.join(" · ")}>
                    {l.details.map((d) => (
                        <span key={d} style={{ fontSize: 10, color: "var(--text-secondary)", background: "var(--bg-tertiary)", borderRadius: 4, padding: "0 4px", whiteSpace: "nowrap" }}>
                            {d}
                        </span>
                    ))}
                </span>
            </div>
            {l.issue && <div style={{ color: "var(--text-primary)", marginTop: 1 }}>{l.issue}</div>}
            {showReasons && l.reasons.map((r) => (
                <div key={r} style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 1 }}>{r}</div>
            ))}
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: "6px 12px", color: "var(--text-tertiary)" }}>{children}</div>;
}

/** 2025-03-04 → 25.03.04 */
const short = (d: string): string => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
