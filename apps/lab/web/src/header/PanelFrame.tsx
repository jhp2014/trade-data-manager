// 패널의 틀 — 등록된 선언(registry) × 자리 장부(ledger)로 **헤더 줄·본문·바닥 줄·오버레이 칩**을 그린다.
// 모든 패널이 이 틀에 감싸인다(panelCatalog.panelComponents). 선언이 없는 패널은 본문만 있는 틀이다.
// workbench components/header/PanelFrame.tsx 에서 옮겼다.
//
// ## 높이 규약
// 라인의 존재 = **배치 설정**(그 자리에 배치된 조각이 있는가)이지 순간의 내용이 아니다 — 값이 비면
// 자리만 비운다. 라인 높이도 상수(HEADER_LINE_H)이고 줄바꿈 없이 가로 스크롤한다. 내용으로 라인이 생멸하거나
// 두 줄이 되면 본문 높이가 출렁여 차트·보드가 리사이즈로 흔들린다.
// 일시 알림(transient 정보)은 그래서 라인이 아니라 **본문 위 오버레이 칩**이다.
import type { ReactNode } from "react";
import { ScrollRow } from "../ui/ScrollRow.js";
import { linesOf, typeKeyOf, useHeaderLedger } from "./ledger.js";
import { useHeaderDecl } from "./registry.js";
import { ControlValue } from "./widgets.js";
import { EMPTY_DECL, type ControlSpec, type InfoSpec } from "./spec.js";

/** 헤더 줄·바닥 줄의 고정 높이 — 내용이 라인 높이를 못 바꾼다. */
export const HEADER_LINE_H = 24;

export function PanelFrame({ panelId, children }: { panelId: string; children: ReactNode }): JSX.Element {
    const decl = useHeaderDecl(panelId) ?? EMPTY_DECL;
    const entry = useHeaderLedger((s) => s.layout[typeKeyOf(panelId)]);
    const lines = linesOf(decl, entry);
    const transients = decl.info.filter((i) => i.transient === true);
    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface)" }}>
            {(lines.lineInfo.length > 0 || lines.lineControls.length > 0) && <HeaderLine info={lines.lineInfo} controls={lines.lineControls} edge="bottom" />}
            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
                {children}
                {transients.length > 0 && <OverlayChips transients={transients} />}
            </div>
            {lines.bottom.length > 0 && <HeaderLine info={lines.bottom} controls={[]} edge="top" />}
        </div>
    );
}

/** 헤더 줄(edge=bottom)·바닥 줄(edge=top) — 좌=정보, 우=컨트롤(헤더 줄만 컨트롤이 선다). */
function HeaderLine({ info, controls, edge }: { info: readonly InfoSpec[]; controls: readonly ControlSpec[]; edge: "top" | "bottom" }): JSX.Element {
    return (
        <ScrollRow
            gap={10}
            data-header-line={edge === "bottom" ? "line" : "bottom"}
            style={{
                flexShrink: 0, height: HEADER_LINE_H, boxSizing: "border-box", padding: "0 10px", background: "var(--bg-secondary)",
                ...(edge === "bottom" ? { borderBottom: "1px solid var(--border-default)" } : { borderTop: "1px solid var(--border-default)" }),
            }}
        >
            {info.map((i) => (
                <InfoValue key={i.id} spec={i} />
            ))}
            {controls.length > 0 && (
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {controls.map((c) => (
                        <span key={c.id} data-control={c.id} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                            {c.renderLine !== undefined ? c.renderLine() : <ControlValue spec={c} />}
                        </span>
                    ))}
                </span>
            )}
        </ScrollRow>
    );
}

const toneColorOf = (tone: InfoSpec["tone"]): string => (tone === "warn" ? "var(--warning)" : tone === "accent" ? "var(--accent-primary)" : "var(--text-tertiary)");

/** 정보 한 조각 — 값이 없으면(null) 자리만 비운다. 정보 판(InfoBoard)의 값 칸도 이걸 쓴다. */
export function InfoValue({ spec }: { spec: InfoSpec }): JSX.Element | null {
    const body = spec.renderLine !== undefined ? spec.renderLine() : spec.text();
    if (body === null) return null;
    return (
        <span className={spec.tabular === true ? "tabular" : undefined} title={spec.help ?? spec.name} style={{ fontSize: 10.5, color: toneColorOf(spec.tone), whiteSpace: "nowrap", flexShrink: 0 }}>
            {body}
        </span>
    );
}

/**
 * 본문 우상단 오버레이 — 일시 알림. 높이에 관여하지 않고 클릭도 안 막는다(pointerEvents none) —
 * 알림은 읽는 것이지 손잡이가 아니다.
 */
function OverlayChips({ transients }: { transients: readonly InfoSpec[] }): JSX.Element {
    return (
        <div style={{ position: "absolute", top: 6, right: 8, left: 8, zIndex: 5, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {transients.map((i) => {
                const text = i.text();
                if (text === null) return null;
                // 일시 알림의 기본 톤은 경고다 — 알림은 대개 "평소와 다르다"는 말이다.
                const warn = (i.tone ?? "warn") === "warn";
                return (
                    <span
                        key={i.id}
                        data-transient={i.id}
                        role="status"
                        className={i.tabular === true ? "tabular" : undefined}
                        style={{
                            fontSize: 10.5, padding: "1px 7px", borderRadius: 4, whiteSpace: "nowrap", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden", textOverflow: "ellipsis",
                            ...(warn
                                ? { color: "var(--warning)", background: "var(--warning-soft)", border: "1px solid rgba(190,122,0,0.25)" }
                                : { color: "var(--accent-hover)", background: "var(--accent-soft)", border: "1px solid rgba(22,121,111,0.3)" }),
                        }}
                    >
                        {text}
                    </span>
                );
            })}
        </div>
    );
}
