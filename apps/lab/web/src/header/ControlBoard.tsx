// 컨트롤 판 — 이 패널의 컨트롤 **전부**가 판 위젯으로 선다. 줄마다: 이름 · 위젯 · 핀 · ⓘ(설명 hover).
// 핀 = 헤더 줄로 꺼내기/넣기 — **어떤 컨트롤이든** 꺼낼 수 있다(workbench 는 항해형만 꺼낼 수 있었다).
// 꺼낸 컨트롤도 판에서 계속 쓸 수 있다. 자리는 패널 종류 단위로 남는다(차트 (1)에서 꺼내면 (2)에도).
// 설명을 늘 펼쳐 적으면 판이 난잡해져서 ⓘ hover 뒤로 접는다.
import { controlPlaceOf, typeKeyOf, useHeaderLedger } from "./ledger.js";
import { useHeaderDecl } from "./registry.js";
import { BoardActionButton, BoardControlValue } from "./widgets.js";
import type { ControlSpec } from "./spec.js";

export function ControlBoard({ panelId }: { panelId: string }): JSX.Element {
    const typeKey = typeKeyOf(panelId);
    const controls = useHeaderDecl(panelId)?.controls ?? [];
    return (
        <div style={{ overflowY: "auto", fontSize: 11.5, padding: "4px 0" }}>
            {controls.length === 0 && <div style={{ padding: "6px 12px", color: "var(--text-tertiary)" }}>이 패널에는 컨트롤이 없습니다</div>}
            {controls.map((c) => (
                <BoardRow key={c.id} spec={c} typeKey={typeKey} />
            ))}
            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 4, padding: "4px 12px 1px", fontSize: 10, color: "var(--text-tertiary)" }}>
                핀 = 헤더 줄에 꺼내 두기 · 같은 종류 패널 모두에 적용
            </div>
        </div>
    );
}

function BoardRow({ spec, typeKey }: { spec: ControlSpec; typeKey: string }): JSX.Element {
    return (
        <div data-board-row={spec.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px" }}>
            {spec.kind === "action" ? (
                // 액션은 이름 자리가 곧 버튼 — 이름 옆에 같은 글자의 버튼을 또 세우면 판이 말을 두 번 한다.
                <span style={{ flex: 1, minWidth: 0 }}>
                    <BoardActionButton spec={spec} />
                </span>
            ) : (
                <>
                    {/* 검색칸은 남는 폭을 다 쓰므로 이름이 자기 폭만 갖는다. */}
                    <span style={{ ...(spec.kind === "search" ? { flexShrink: 0 } : { flex: 1, minWidth: 0 }), color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {spec.name}
                    </span>
                    <BoardControlValue spec={spec} />
                </>
            )}
            <PlacePin spec={spec} typeKey={typeKey} />
            <HelpDot help={spec.help} />
        </div>
    );
}

/** 자리 핀 — 켜짐 = 헤더 줄에 꺼내져 있다. */
function PlacePin({ spec, typeKey }: { spec: ControlSpec; typeKey: string }): JSX.Element {
    const entry = useHeaderLedger((s) => s.layout[typeKey]);
    const onLine = controlPlaceOf(spec, entry) === "line";
    return (
        <button
            onClick={() => useHeaderLedger.getState().setControlPlace(typeKey, spec, onLine ? "sheet" : "line")}
            title={onLine ? "헤더 줄에서 넣는다(이 판에서는 계속 쓸 수 있다)" : "헤더 줄에 꺼내 둔다"}
            aria-label={onLine ? "헤더 줄에서 넣기" : "헤더 줄로 꺼내기"}
            aria-pressed={onLine}
            style={{ border: "none", background: "none", padding: "0 2px", cursor: "pointer", lineHeight: 0, flexShrink: 0, color: onLine ? "var(--accent-primary)" : "var(--border-strong)" }}
        >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={onLine ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
            </svg>
        </button>
    );
}

/** 설명은 hover 뒤로 — 설명이 없는 컨트롤도 같은 폭의 빈 칸을 들어 줄 끝이 맞는다. */
function HelpDot({ help }: { help: string | undefined }): JSX.Element {
    if (help === undefined) return <span style={{ width: 13, flexShrink: 0 }} />;
    return (
        <span title={help} aria-label="설명" style={{ display: "inline-flex", flexShrink: 0, color: "var(--border-strong)", cursor: "help" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
            </svg>
        </span>
    );
}
