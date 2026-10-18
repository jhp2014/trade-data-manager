// 종목 이력 창 — 보드의 종목 줄을 우클릭(OnInspect)하면 그 자리에 뜬다. 바깥 누름 · Esc 로 닫힌다(팝오버 스택).
// 데이터는 /theme/stocks/{code}(tdm-ai 움직인 날) — 복기 중 보는 날짜(asOf)가 있으면 서버가 그날까지로 자른다.
//   머리: 종목명 · 코드 · asOf(있으면)
//   검색: 이유·테마·근거 제목을 부분 문자열로 거른다(클라에서만 — 서버 검색 없음)
//   이력 줄: 최근부터 — 날짜 · 테마들 · 이유 한 줄 · 근거(제목 · 시각, ref 는 표시만)
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingSurface } from "../ui/popover/FloatingSurface.js";
import { useCloseOnDetach } from "../ui/popover/useFitInViewport.js";
import { ScrollRow } from "../ui/ScrollRow.js";
import { ApiError } from "../market/http.js";
import { useStockMoves, useStockName } from "../market/queries.js";
import type { MoveIssue } from "../market/types.js";

/** 쓰는 쪽 계약: (code, at)마다 key 로 새로 만든다 — 배치 방향·검색어가 인스턴스에 남는다(BoardPanel 참조). */
export function StockHistoryPopover({ code, asOf, at, onClose }: {
    code: string;
    /** 복기 중 보는 날짜 — 주면 서버가 date <= asOf(당일 포함)만 준다(사후정보 차단). */
    asOf?: string;
    at: { x: number; y: number };
    onClose: () => void;
}): JSX.Element {
    // 누른 자리에 0 크기 앵커를 두고 판을 그 아래에 연다(자리 계산은 FloatingSurface). 앵커는 body 에 둔다 —
    // dockview 패널의 transform 안에서는 position:fixed 가 패널 기준이 된다. 그래서 탭 전환 등으로 **패널이
    // 떨어지면** 닫히는 일은 패널 안에 둔 표식(marker)이 한다(body 앵커는 늘 붙어 있어 감시에 안 걸린다).
    const anchorRef = useRef<HTMLSpanElement>(null);
    const markerRef = useRef<HTMLSpanElement>(null);
    useCloseOnDetach(markerRef, onClose);
    const [q, setQ] = useState("");
    const masterName = useStockName(code);
    const moves = useStockMoves(code, asOf);
    // 404 는 두 가지 — "이력 없는 종목"(데이터)과 "없는 경로"(배선 오류, 옛 lab-api 가 떠 있을 때). body 로 가른다.
    const notFound = moves.error instanceof ApiError && moves.error.status === 404 && moves.error.body.includes("이력 없는 종목");
    // 서버는 날짜 오름차순 — 화면은 최근부터.
    const lines = useMemo(() => {
        const desc = [...(moves.data?.issues ?? [])].reverse();
        const needle = q.trim().toLowerCase();
        if (!needle) return desc;
        const hay = (i: MoveIssue) => [i.issue, ...i.themes, ...i.evidence.map((e) => e.title)];
        return desc.filter((i) => hay(i).some((s) => s.toLowerCase().includes(needle)));
    }, [moves.data, q]);
    return (
        <>
            <span ref={markerRef} hidden />
            {createPortal(<span ref={anchorRef} style={{ position: "fixed", left: at.x, top: at.y, width: 0, height: 0 }} />, document.body)}
            <FloatingSurface anchorRef={anchorRef} place={{ side: "below", align: "start", gap: 2 }} onClose={onClose} layout="column" width={460} padding={0}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{moves.data?.name ?? masterName ?? code}</span>
                    <span className="tabular" style={{ color: "var(--text-tertiary)" }}>{code}</span>
                    {asOf && (
                        <span className="tabular" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)" }} title="보는 날짜까지만(사후정보 차단)">
                            ~ {asOf}
                        </span>
                    )}
                </div>
                <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <input
                        value={q}
                        placeholder="이력 검색 — 이유 · 테마 · 근거 제목"
                        onChange={(e) => setQ(e.target.value)}
                        style={{ width: "100%", padding: "2px 6px", border: "1px solid var(--border)", borderRadius: 3, fontSize: 12 }}
                    />
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 0 8px" }}>
                    {moves.isError && !notFound ? (
                        <Note>이력 오류: {moves.error.message}</Note>
                    ) : notFound ? (
                        <Note>이력 없음 — 움직인 날 기록에 없는 종목.</Note>
                    ) : moves.data === undefined ? (
                        <Note>이력 불러오는 중…</Note>
                    ) : lines.length === 0 ? (
                        // asOf 가 기록 범위 앞이면 "없음"이 아니라 "아직 모름" — 그 구간은 아카이브가 훑지 않았다.
                        <Note>
                            {q.trim()
                                ? "검색과 맞는 이력 없음"
                                : asOf && asOf < moves.data.from
                                  ? `기록 범위(${moves.data.from}~) 이전 — 아직 모른다`
                                  : asOf
                                    ? `${asOf} 까지 움직인 날 없음(기록 ${moves.data.from}~)`
                                    : "움직인 날 없음"}
                        </Note>
                    ) : (
                        <>
                            {lines.map((l) => <Line key={l.date} l={l} />)}
                            <div style={{ padding: "6px 12px 0", fontSize: 10, color: "var(--text-tertiary)" }}>
                                기록 범위 {moves.data.from} ~ {asOf && asOf < moves.data.to ? asOf : moves.data.to}
                            </div>
                        </>
                    )}
                </div>
            </FloatingSurface>
        </>
    );
}

/** 이력 한 줄 — 날짜 · 테마 칩 · 이유, 아래에 근거(제목 · 시각 · ref 표시). */
function Line({ l }: { l: MoveIssue }): JSX.Element {
    return (
        <div style={{ padding: "4px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                <span className="tabular" style={{ color: "var(--text-secondary)", flexShrink: 0 }}>{l.date}</span>
                {/* 칩이 넘치면 자르지 않고 가로 스크롤(ScrollRow 규약 — 자식은 flexShrink 0). */}
                <ScrollRow gap={3} style={{ flex: 1 }}>
                    {l.themes.map((t) => (
                        <span key={t} style={{ flexShrink: 0, fontSize: 10, color: "var(--text-secondary)", background: "var(--bg-tertiary)", borderRadius: 4, padding: "0 4px", whiteSpace: "nowrap" }}>
                            {t}
                        </span>
                    ))}
                </ScrollRow>
            </div>
            {l.issue && <div style={{ color: "var(--text-primary)", marginTop: 1 }}>{l.issue}</div>}
            {l.evidence.map((e) => (
                <div key={e.ref} style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 1, fontSize: 11, color: "var(--text-tertiary)", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.title}>{e.title}</span>
                    <span className="tabular" style={{ flexShrink: 0 }}>
                        {e.date === l.date ? "" : `${e.date} `}{e.time}
                        {typeof e.pct === "number" ? ` · ${e.pct > 0 ? "+" : ""}${e.pct}%` : ""}
                    </span>
                    {/* ref 는 아카이브 좌표 — 표시만(링크 아님). */}
                    <span className="tabular" style={{ flexShrink: 0, marginLeft: "auto" }} title="근거 좌표(표시만)">{e.ref}</span>
                </div>
            ))}
        </div>
    );
}

function Note({ children }: { children: React.ReactNode }): JSX.Element {
    return <div style={{ padding: "6px 12px", color: "var(--text-tertiary)" }}>{children}</div>;
}
