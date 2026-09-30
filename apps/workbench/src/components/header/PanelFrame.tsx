// 패널의 틀 — 등록된 선언(registry) × 배치 장부(ledger)로 **첫 줄·본문·바닥 줄·오버레이 칩**을 그린다.
// 모든 패널이 이 틀에 감싸인다(panelCatalog.panelComponents). 등록이 없는 패널은 본문만 있는 틀이다.
//
// ## 높이 규약
// 라인의 존재 = **배치 설정**(그 자리에 배치된 조각이 있는가)이지 순간의 내용이 아니다 — 값이 비면
// 자리만 비운다. 라인 높이도 상수(HEADER_LINE_H)다. 내용으로 라인이 생멸하면 본문 높이가 출렁여
// 차트류가 리사이즈로 흔들린다(ScrollRow 가 줄바꿈을 버린 것과 같은 근거).
// 일시 알림(transient 정보·단축키 피드백)은 그래서 라인이 아니라 **본문 위 오버레이 칩**이다.
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { ScrollRow } from "../ControlChrome.js";
import { useHeaderLedger, linesOf, typeKeyOf } from "./ledger.js";
import { useHeaderDecl } from "./registry.js";
import { NOTICE_MS, useHeaderNotice } from "./notice.js";
import { ControlValue } from "./widgets.js";
import { EMPTY_DECL, type ControlSpec, type InfoSpec } from "./spec.js";

/** 헤더 첫 줄·바닥 줄의 고정 높이 — 내용이 라인 높이를 못 바꾼다. */
export const HEADER_LINE_H = 24;

export function PanelFrame({ panelId, children }: { panelId: string; children: ReactNode }): JSX.Element {
    const decl = useHeaderDecl(panelId) ?? EMPTY_DECL;
    const entry = useHeaderLedger((s) => s.layout[typeKeyOf(panelId)]);
    const lines = linesOf(decl, entry);
    const transients = decl.info.filter((i) => i.transient === true && i.available !== false);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            {(lines.lineInfo.length > 0 || lines.lineControls.length > 0) && (
                <HeaderLine info={lines.lineInfo} controls={lines.lineControls} edge="bottom" />
            )}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {children}
                <OverlayChips panelId={panelId} transients={transients} />
            </div>
            {lines.bottom.length > 0 && <HeaderLine info={lines.bottom} controls={[]} edge="top" />}
        </div>
    );
}

/** 첫 줄(edge=bottom)·바닥 줄(edge=top) — 좌=정보, 우=컨트롤(첫 줄만 컨트롤이 선다). */
function HeaderLine({ info, controls, edge }: {
    info: readonly InfoSpec[];
    controls: readonly ControlSpec[];
    edge: "top" | "bottom";
}): JSX.Element {
    return (
        <ScrollRow gap={10} data-header-line={edge === "bottom" ? "line" : "bottom"}
            style={{
                flexShrink: 0, height: HEADER_LINE_H, padding: "0 10px",
                background: "var(--bg-secondary)",
                ...(edge === "bottom"
                    ? { borderBottom: "1px solid var(--border-default)" }
                    : { borderTop: "1px solid var(--border-default)" }),
            }}>
            {info.map((i) => <InfoValue key={i.id} spec={i} />)}
            {controls.length > 0 && (
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {controls.map((c) => <InlineControl key={c.id} spec={c} />)}
                </span>
            )}
        </ScrollRow>
    );
}

/** 첫 줄의 컨트롤 — 패널이 renderInline 을 선언했다면 그것이, 아니면 kind 기본 위젯이 선다. */
function InlineControl({ spec }: { spec: ControlSpec }): JSX.Element {
    if (spec.renderInline !== undefined) return <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{spec.renderInline()}</span>;
    return <ControlValue spec={spec} />;
}

const toneColorOf = (tone: InfoSpec["tone"]): string =>
    tone === "warn" ? "var(--warning)" : tone === "accent" ? "var(--accent-primary)" : "var(--text-tertiary)";

/** 정보 한 조각 — 값이 없으면(null) 자리만 비운다. InfoBoard(정보 판)의 값 칸도 이걸 쓴다. */
export function InfoValue({ spec }: { spec: InfoSpec }): JSX.Element | null {
    const body = spec.renderLine !== undefined ? spec.renderLine() : spec.text();
    if (body === null) return null;
    return (
        <span className={spec.tabular === true ? "tabular" : undefined} title={spec.help ?? spec.name}
            style={{ fontSize: 10.5, color: toneColorOf(spec.tone), whiteSpace: "nowrap", flexShrink: 0 }}>
            {body}
        </span>
    );
}

/**
 * 본문 우상단 오버레이 — 일시 알림(transient 정보)과 단축키 피드백. 높이에 관여하지 않고
 * 클릭도 안 막는다(pointerEvents none) — 알림은 읽는 것이지 손잡이가 아니다(고칠 손은 컨트롤로).
 */
function OverlayChips({ panelId, transients }: { panelId: string; transients: readonly InfoSpec[] }): JSX.Element {
    return (
        <div style={{
            position: "absolute", top: 6, right: 8, zIndex: 5, pointerEvents: "none",
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
        }}>
            {transients.map((i) => <TransientChip key={i.id} spec={i} />)}
            <NoticeChip panelId={panelId} />
        </div>
    );
}

const chipStyle = (tone: InfoSpec["tone"] | "notice"): CSSProperties => ({
    fontSize: 10.5, padding: "1px 7px", borderRadius: 4, whiteSpace: "nowrap",
    ...(tone === "warn"
        ? { color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid rgba(190,122,0,0.25)" }
        : { color: "var(--accent-hover)", background: "var(--accent-soft)", border: "1px solid rgba(22,121,111,0.3)" }),
});

function TransientChip({ spec }: { spec: InfoSpec }): JSX.Element | null {
    const body = spec.renderLine !== undefined ? spec.renderLine() : spec.text();
    if (body === null) return null;
    // 일시 알림의 기본 톤은 경고다 — 알림은 대개 "평소와 다르다"는 말이다.
    return <span className={spec.tabular === true ? "tabular" : undefined} style={chipStyle(spec.tone ?? "warn")}>{body}</span>;
}

/** 단축키 피드백 — "바뀌었다" 한마디가 잠깐 섰다 사라진다(NOTICE_MS). */
function NoticeChip({ panelId }: { panelId: string }): JSX.Element | null {
    const notice = useHeaderNotice((s) => s.byPanel[panelId]);
    const seq = notice?.seq;
    useEffect(() => {
        if (seq === undefined) return;
        const t = setTimeout(() => useHeaderNotice.getState().expire(panelId, seq), NOTICE_MS);
        return () => clearTimeout(t);
    }, [panelId, seq]);
    if (notice === undefined) return null;
    return <span style={chipStyle("notice")}>{notice.text}</span>;
}
