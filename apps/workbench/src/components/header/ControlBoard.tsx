// 컨트롤 모음 판 — 이 판의 컨트롤 **전부**가 자기 모양(kind 위젯)으로 선다. 줄마다: 숫자 배지(단축키
// 배정) · 이름 · 위젯 · ⓘ(설명 hover). 항해형(nav)에는 핀이 하나 더 — 첫 줄에 올리기/내리기.
// 설명을 늘 펼쳐 적던 옛 더보기 판이 난잡했던 이유가 그 글자들이라, 설명은 ⓘ hover 뒤로 접는다.
import { useEffect } from "react";
import { useHeaderLedger, controlPlaceOf, digitOf, typeKeyOf } from "./ledger.js";
import { useHeaderDecl, useHeaderRegistry } from "./registry.js";
import { ControlValue } from "./widgets.js";
import type { ControlSpec } from "./spec.js";

export function ControlBoard({ panelId }: { panelId: string }): JSX.Element {
    const typeKey = typeKeyOf(panelId);
    const decl = useHeaderDecl(panelId);
    const keysEntry = useHeaderLedger((s) => s.keys[typeKey]);
    const pending = useHeaderRegistry((s) => s.pendingAssign);
    // 판이 닫히면 배정 대기도 버린다 — 판 밖에 남은 대기는 다음 숫자를 엉뚱하게 배정으로 삼킨다.
    useEffect(() => () => {
        const r = useHeaderRegistry.getState();
        if (r.pendingAssign?.typeKey === typeKey) r.setPendingAssign(null);
    }, [typeKey]);
    const controls = (decl?.controls ?? []).filter((c) => c.available !== false);
    return (
        <div style={{ overflowY: "auto", fontSize: 11.5, padding: "4px 0" }}>
            {controls.length === 0 && (
                <div style={{ padding: "6px 12px", color: "var(--text-tertiary)" }}>이 판에는 컨트롤이 없습니다</div>
            )}
            {controls.map((c) => (
                <BoardRow key={c.id} spec={c} typeKey={typeKey}
                    digit={digitOf(keysEntry, c.id)}
                    armed={pending?.typeKey === typeKey && pending.controlId === c.id} />
            ))}
            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 4, padding: "4px 12px 1px", fontSize: 10, color: "var(--text-tertiary)" }}>
                {pending?.typeKey === typeKey
                    ? "숫자 1~5 를 눌러 배정 · 배지 다시 클릭 = 취소"
                    : "숫자 배지 클릭 = 단축키 배정 · 핀 = 첫 줄에 올리기"}
            </div>
        </div>
    );
}

function BoardRow({ spec, typeKey, digit, armed }: {
    spec: ControlSpec;
    typeKey: string;
    digit: number | null;
    armed: boolean;
}): JSX.Element {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px" }}>
            <DigitBadge typeKey={typeKey} controlId={spec.id} digit={digit} armed={armed} />
            <span style={{ flex: 1, minWidth: 0, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {spec.name}
            </span>
            {spec.nav === true && <PlacePin spec={spec} typeKey={typeKey} />}
            <ControlValue spec={spec} />
            <HelpDot help={spec.help} />
        </div>
    );
}

/**
 * 숫자 배지 — 클릭 = 배정 대기(다음 숫자 키가 이 컨트롤에 적힌다). 배정은 keymap 의 숫자 커맨드가
 * 소비한다(shortcut.pressSlot) — 여기서 keydown 을 직접 들으면 같은 키를 두 곳이 듣게 된다.
 */
function DigitBadge({ typeKey, controlId, digit, armed }: {
    typeKey: string;
    controlId: string;
    digit: number | null;
    armed: boolean;
}): JSX.Element {
    const toggleArm = (): void => {
        const r = useHeaderRegistry.getState();
        r.setPendingAssign(armed ? null : { typeKey, controlId });
    };
    return (
        <button onClick={toggleArm}
            title={armed ? "숫자 1~5 를 눌러 배정 (다시 클릭 = 취소)" : digit !== null ? `단축키 ${digit} — 클릭해 다시 배정` : "단축키 배정 — 클릭 후 숫자 1~5"}
            className="tabular"
            style={{
                width: 16, height: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 9.5, lineHeight: 1, borderRadius: 3, cursor: "pointer", padding: 0,
                border: `1px ${digit !== null || armed ? "solid" : "dashed"} ${armed ? "var(--accent-primary)" : "var(--border-default)"}`,
                background: armed ? "var(--accent-soft)" : "none",
                color: armed ? "var(--accent-primary)" : digit !== null ? "var(--text-secondary)" : "var(--border-strong)",
            }}>
            {digit ?? ""}
        </button>
    );
}

/** 항해형의 자리 핀 — 켜짐 = 첫 줄에 올라가 있다. 내리면 이 판에서만 만진다. */
function PlacePin({ spec, typeKey }: { spec: ControlSpec; typeKey: string }): JSX.Element {
    const entry = useHeaderLedger((s) => s.layout[typeKey]);
    const onLine = controlPlaceOf(spec, entry) === "line";
    return (
        <button onClick={() => useHeaderLedger.getState().setControlPlace(typeKey, spec, onLine ? "sheet" : "line")}
            title={onLine ? "첫 줄에서 내린다(이 판에서는 계속 쓸 수 있다)" : "첫 줄에 올린다"}
            aria-label={onLine ? "첫 줄에서 내리기" : "첫 줄에 올리기"}
            style={{
                border: "none", background: "none", padding: "0 2px", cursor: "pointer", lineHeight: 0, flexShrink: 0,
                color: onLine ? "var(--accent-primary)" : "var(--border-strong)",
            }}>
            <PinIcon filled={onLine} />
        </button>
    );
}

/** 설명은 hover 뒤로 — 없는 컨트롤도 같은 폭의 빈 칸을 들어 줄 끝이 맞는다. */
function HelpDot({ help }: { help: string | undefined }): JSX.Element {
    if (help === undefined) return <span style={{ width: 13, flexShrink: 0 }} />;
    return (
        <span title={help} aria-label="설명" style={{ display: "inline-flex", flexShrink: 0, color: "var(--border-strong)", cursor: "help" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
            </svg>
        </span>
    );
}

function PinIcon({ filled }: { filled: boolean }): JSX.Element {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
        </svg>
    );
}
