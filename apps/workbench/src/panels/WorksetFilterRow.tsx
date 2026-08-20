// 작업셋 존재 필터 줄 — DNF(필터 안 AND, 필터 사이 OR)를 **항상 펼쳐** 보여준다(E안).
// 숨은 필터는 "왜 목록이 비었지" 사고라, 식 전체가 상시 화면에 있고 편집도 이 줄에서 끝난다:
//   · 필터 토큰 안 칩 클릭 = has → !not → 제거 순환(활성 칩만 그린다)
//   · 토큰 hover 에만 ＋(종류 추가 AND)·✕(필터 삭제)가 나타난다 — 상시면 칩보다 손잡이가 시끄럽다
//   · "+ 필터" = 종류 팝오버에서 골라 새 필터(OR). **아무 필터도 없을 때만** 프리셋이 함께 선다 —
//     보는 패널에 맞는 미완 질문("골격 채울 날")을 원클릭으로. 프리셋은 자주 쓰는 필터의 이름일 뿐
//     별도 개념이 아니다(같은 DNF 로 풀린다).
// 이 필터는 "작업 완료/미완료"에 가까운 작업 패널 전용 개념 — 깔때기 조건으로 올리지 않는다(사용자 확정).
import { hasActiveFilter, PRESENCE_KINDS, type PresenceDnf, type PresenceFilter, type TriState } from "../lib/presence.js";
import { HeaderPopover } from "../components/HeaderPopover.js";
import { ScrollRow } from "../components/ControlChrome.js";

/** 필터가 하나도 없을 때 "+ 필터" 팝오버에 서는 프리셋 — 작업 패널들의 "채우러 갈 날" 질문 모음. */
const FILTER_PRESETS: { name: string; clause: PresenceFilter }[] = [
    { name: "골격 채울 날", clause: { skeleton: "not" } },
    { name: "분봉 골격 채울 날", clause: { "skeleton-minute": "not" } },
    { name: "타점 찍을 날", clause: { point: "not" } },
    { name: "골격만 · 타점 없음", clause: { skeleton: "has", point: "not" } },
];

/** 필터 안 칩 하나 — 종류색 테두리, !상태는 파선+취소선(부정 리터럴의 기존 문법). */
function ClauseChip({ name, color, state, onClick }: { name: string; color: string; state: TriState; onClick: () => void }): JSX.Element {
    const not = state === "not";
    return (
        <button
            onClick={onClick}
            title={not ? `${name} 없는 날만 (클릭: 필터에서 제거)` : `${name} 있는 날만 (클릭: 없는 날만)`}
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

/** 종류 고르기 팝오버 — trigger 는 호출부가 준다(필터 안 ＋ / 줄 끝 + 필터). */
function KindPicker({ exclude, presets, onPick, onPreset, trigger }: {
    /** 이미 이 필터에 있는 종류(목록에서 뺀다). */
    exclude: PresenceFilter;
    /** 프리셋 섹션 — 아무 필터도 없을 때의 "+ 필터"만 준다. */
    presets?: readonly { name: string; clause: PresenceFilter }[];
    onPick: (kindKey: string) => void;
    onPreset?: (clause: PresenceFilter) => void;
    trigger: (open: boolean, toggle: () => void) => JSX.Element;
}): JSX.Element | null {
    const candidates = PRESENCE_KINDS.filter((k) => (exclude[k.key] ?? "any") === "any");
    if (candidates.length === 0 && (presets?.length ?? 0) === 0) return null;
    const item = (key: string, label: string, color: string, run: () => void, close: () => void): JSX.Element => (
        <button key={key} onClick={() => { run(); close(); }}
            style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", color, fontWeight: 600, padding: "4px 10px", cursor: "pointer", font: "inherit", fontSize: 11.5, whiteSpace: "nowrap" }}>
            {label}
        </button>
    );
    return (
        <HeaderPopover width={140} align="start" closeOnOutside trigger={trigger}>
            {(close) => (
                <div style={{ overflowY: "auto", padding: "2px 0" }}>
                    {presets && presets.length > 0 && (
                        <>
                            <div style={{ padding: "3px 10px 1px", fontSize: 9.5, color: "var(--text-tertiary)" }}>프리셋</div>
                            {presets.map((p) => item(`p-${p.name}`, p.name, "var(--text-primary)", () => onPreset?.(p.clause), close))}
                            <div style={{ padding: "3px 10px 1px", fontSize: 9.5, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-subtle)", marginTop: 2 }}>종류</div>
                        </>
                    )}
                    {candidates.map((k) => item(k.key, k.name, k.color, () => onPick(k.key), close))}
                </div>
            )}
        </HeaderPopover>
    );
}

export function WorksetFilterRow({ dnf, onChange }: { dnf: PresenceDnf; onChange: (next: PresenceDnf) => void }): JSX.Element {
    const setClause = (ci: number, next: PresenceFilter): void => onChange(dnf.map((c, i) => (i === ci ? next : c)));
    const cycleChip = (ci: number, key: string): void => {
        const clause = dnf[ci] ?? {};
        // 표시된 칩은 활성뿐이라 순환은 has → not → 제거.
        if ((clause[key] ?? "any") === "has") setClause(ci, { ...clause, [key]: "not" });
        else {
            const { [key]: _drop, ...rest } = clause as Record<string, TriState>;
            setClause(ci, rest);
        }
    };

    return (
        <ScrollRow gap={5} style={{ flexShrink: 0, padding: "3px 8px", borderBottom: "1px solid var(--border-default)", background: "var(--bg-secondary)" }}>
            {dnf.map((clause, ci) => {
                const chips = PRESENCE_KINDS.filter((k) => (clause[k.key] ?? "any") !== "any");
                return (
                    // React 키가 인덱스인 것은 수용 — 필터는 참조 정체성이 없고(내용이 전부), 중간 삭제 시
                    // 뒤 필터가 앞 키를 물려받아도 상태가 전부 props 라 오염될 로컬 상태가 없다.
                    <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                        {ci > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", marginRight: 2 }}>OR</span>}
                        <span className="ws-filter-token"
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 4px",
                                border: "1px solid var(--border-default)", borderRadius: 4, background: "var(--bg-primary)",
                            }}
                        >
                            {chips.length === 0 && <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>빈 필터</span>}
                            {chips.map((k) => (
                                <ClauseChip key={k.key} name={k.name} color={k.color} state={clause[k.key] ?? "any"} onClick={() => cycleChip(ci, k.key)} />
                            ))}
                            {/* 편집 손잡이 — hover 에만(theme.css .ws-filter-token). ＋는 칩만 하게, ✕는 더 작게,
                                둘 사이는 띄운다(오클릭 방지 — 추가하려다 필터를 지우는 사고). */}
                            <span className="ws-filter-tools" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 2 }}>
                                <KindPicker
                                    exclude={clause}
                                    onPick={(key) => setClause(ci, { ...clause, [key]: "has" })}
                                    trigger={(_open, toggle) => (
                                        <button onClick={toggle} title="이 필터에 종류 추가(AND)"
                                            style={{ border: "none", background: "none", cursor: "pointer", font: "inherit", fontSize: 12, lineHeight: 1, color: "var(--text-secondary)", padding: 0, flexShrink: 0 }}>
                                            ＋
                                        </button>
                                    )}
                                />
                                <button onClick={() => onChange(dnf.filter((_, i) => i !== ci))} title="필터 삭제"
                                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: 8.5, lineHeight: 1, padding: 0, flexShrink: 0 }}>
                                    ✕
                                </button>
                            </span>
                        </span>
                    </span>
                );
            })}
            <KindPicker
                exclude={{}}
                presets={dnf.length === 0 ? FILTER_PRESETS : undefined}
                onPick={(key) => onChange([...dnf, { [key]: "has" }])}
                onPreset={(clause) => onChange([...dnf, clause])}
                trigger={(_open, toggle) => (
                    <button onClick={toggle} title="필터 추가(OR) — 필터 안은 AND"
                        style={{ flexShrink: 0, cursor: "pointer", font: "inherit", fontSize: 10.5, padding: "1px 6px", borderRadius: 3, border: "1px dashed var(--border-strong)", background: "transparent", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        + 필터
                    </button>
                )}
            />
        </ScrollRow>
    );
}

/** 필터 요약 문자열 — 컨트롤 줄 좌측 정보("무엇으로 걸렀나")·툴팁용. */
export function dnfSummary(dnf: PresenceDnf): string {
    const parts = dnf.filter(hasActiveFilter).map((c) =>
        PRESENCE_KINDS.filter((k) => (c[k.key] ?? "any") !== "any")
            .map((k) => (c[k.key] === "not" ? `!${k.name}` : k.name))
            .join("∧"),
    );
    return parts.join(" ∨ ");
}
