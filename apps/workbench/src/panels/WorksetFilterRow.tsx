// 작업셋 존재 필터 줄 — DNF(절 안 AND, 절 사이 OR)를 **항상 펼쳐** 보여준다(E안).
// 숨은 필터는 "왜 목록이 비었지" 사고라, 식 전체가 상시 화면에 있고 편집도 이 줄에서 끝난다:
//   · 절 토큰 안 칩 클릭 = has → !not → 제거 순환(활성 칩만 그린다 — 무관 칩까지 깔면 절이 폭을 다 먹는다)
//   · 절 안 + = 종류 팝오버(아직 안 쓴 종류만) → 고르면 has 로 추가
//   · 절 ✕ = 절 삭제(명시 규칙 — "마지막 칩이 빠지면 소멸" 같은 암묵 규칙은 발견이 안 된다)
//   · 줄 끝 + 절 = 빈 절 추가(빈 절은 평가 제외 — presence.ts 규칙이라 목록이 갑자기 안 바뀐다)
// 이 필터는 "작업 완료/미완료"에 가까운 작업 패널 전용 개념 — 깔때기 조건으로 올리지 않는다(사용자 확정).
import { hasActiveFilter, hasActiveDnf, PRESENCE_KINDS, type PresenceDnf, type PresenceFilter, type TriState } from "../lib/presence.js";
import { HeaderPopover } from "../components/HeaderPopover.js";
import { ScrollRow } from "../components/ControlChrome.js";

/** 절 안 칩 하나 — 종류색 테두리, !상태는 파선+취소선(부정 리터럴의 기존 문법). */
function ClauseChip({ name, color, state, onClick }: { name: string; color: string; state: TriState; onClick: () => void }): JSX.Element {
    const not = state === "not";
    return (
        <button
            onClick={onClick}
            title={not ? `${name} 없는 날만 (클릭: 절에서 제거)` : `${name} 있는 날만 (클릭: 없는 날만)`}
            style={{
                cursor: "pointer", font: "inherit", fontSize: 10.5, fontWeight: 700, padding: "0 5px", borderRadius: 3,
                lineHeight: 1.5, whiteSpace: "nowrap", flexShrink: 0,
                border: `1px ${not ? "dashed" : "solid"} ${color}`,
                background: not ? "transparent" : `${color}1a`,
                color, textDecoration: not ? "line-through" : "none",
            }}
        >
            {not ? `!${name}` : name}
        </button>
    );
}

/** 절에 종류 추가 팝오버 — 이 절에 아직 없는 종류만 목록에 선다. */
function AddKindButton({ clause, onAdd }: { clause: PresenceFilter; onAdd: (key: string) => void }): JSX.Element | null {
    const candidates = PRESENCE_KINDS.filter((k) => (clause[k.key] ?? "any") === "any");
    if (candidates.length === 0) return null;
    return (
        <HeaderPopover
            width={110}
            align="start"
            closeOnOutside
            trigger={(_open, toggle) => (
                <button
                    onClick={toggle}
                    title="이 절에 종류 추가(AND)"
                    style={{ border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: 11, color: "var(--text-tertiary)", padding: "0 2px", flexShrink: 0 }}
                >
                    +
                </button>
            )}
        >
            {(close) => (
                <div style={{ overflowY: "auto", padding: "2px 0" }}>
                    {candidates.map((k) => (
                        <button
                            key={k.key}
                            onClick={() => { onAdd(k.key); close(); }}
                            style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color: k.color, fontWeight: 600, padding: "4px 10px", cursor: "pointer", font: "inherit", fontSize: 11.5 }}
                        >
                            {k.name}
                        </button>
                    ))}
                </div>
            )}
        </HeaderPopover>
    );
}

export function WorksetFilterRow({ dnf, onChange }: { dnf: PresenceDnf; onChange: (next: PresenceDnf) => void }): JSX.Element {
    const setClause = (ci: number, next: PresenceFilter): void => onChange(dnf.map((c, i) => (i === ci ? next : c)));
    const cycleChip = (ci: number, key: string): void => {
        const clause = dnf[ci] ?? {};
        const cur = clause[key] ?? "any";
        // 표시된 칩은 활성뿐이라 순환은 has → not → 제거.
        if (cur === "has") setClause(ci, { ...clause, [key]: "not" });
        else {
            const { [key]: _drop, ...rest } = clause as Record<string, TriState>;
            setClause(ci, rest);
        }
    };
    const addChip = (ci: number, key: string): void => setClause(ci, { ...(dnf[ci] ?? {}), [key]: "has" });
    const removeClause = (ci: number): void => onChange(dnf.filter((_, i) => i !== ci));

    return (
        <ScrollRow gap={5} style={{ flexShrink: 0, padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
            {dnf.map((clause, ci) => {
                const chips = PRESENCE_KINDS.filter((k) => (clause[k.key] ?? "any") !== "any");
                return (
                    // React 키가 인덱스인 것은 수용 — 절은 참조 정체성이 없고(내용이 전부), 중간 삭제 시
                    // 뒤 절이 앞 키를 물려받아도 상태가 전부 props 라 오염될 로컬 상태가 없다.
                    <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        {ci > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", marginRight: 2 }}>OR</span>}
                        <span
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 4px",
                                border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)",
                            }}
                        >
                            {chips.length === 0 && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>빈 절</span>}
                            {chips.map((k) => (
                                <ClauseChip key={k.key} name={k.name} color={k.color} state={clause[k.key] ?? "any"} onClick={() => cycleChip(ci, k.key)} />
                            ))}
                            <AddKindButton clause={clause} onAdd={(key) => addChip(ci, key)} />
                            <button
                                onClick={() => removeClause(ci)}
                                title="절 삭제"
                                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 9.5, lineHeight: 1, padding: "0 1px", flexShrink: 0 }}
                            >
                                ✕
                            </button>
                        </span>
                    </span>
                );
            })}
            <button
                onClick={() => onChange([...dnf, {}])}
                title="절 추가(OR) — 절 안은 AND"
                style={{ flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 10.5, padding: "1px 6px", borderRadius: 3, border: "1px dashed var(--border-strong)", background: "transparent", color: "var(--text-secondary)", whiteSpace: "nowrap" }}
            >
                + 절
            </button>
            {hasActiveDnf(dnf) && (
                <button
                    onClick={() => onChange([])}
                    title="존재 필터 전부 해제"
                    style={{ flexShrink: 0, marginLeft: "auto", border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: 10.5, color: "var(--text-secondary)", whiteSpace: "nowrap" }}
                >
                    해제 ⤺
                </button>
            )}
        </ScrollRow>
    );
}

/** 절 요약 문자열 — 컨트롤 줄 좌측 정보("무엇으로 걸렀나")·툴팁용. */
export function dnfSummary(dnf: PresenceDnf): string {
    const parts = dnf.filter(hasActiveFilter).map((c) =>
        PRESENCE_KINDS.filter((k) => (c[k.key] ?? "any") !== "any")
            .map((k) => (c[k.key] === "not" ? `!${k.name}` : k.name))
            .join("∧"),
    );
    return parts.join(" ∨ ");
}
