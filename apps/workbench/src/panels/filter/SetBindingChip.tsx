// 바인딩 칩 — 패널 헤더 **왼쪽**(말의 자리)에 서서 "지금 이 패널이 보는 집합"을 상시 말한다.
// 패널마다 다른 집합을 볼 수 있게 된 순간부터 이 라벨이 없으면 사과와 배를 나란히 놓고 같은 줄 안다.
//
// 누르면 고르는 판이 열린다: 연동(디폴트) / 전체 / 활성 필터 / 저장 필터 / 그룹.
// 깨진 참조면 칩이 경고색으로 서고, 판 맨 위에 "전체로 전환" 손잡이가 붙는다(자동 폴백은 없다 —
// 실패가 조용히 넓어지는 방향이라, 전환은 언제나 사람 손으로).
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useGroups } from "../../lib/GroupsContext.js";
import { useWorkbench } from "../../store/workbench.js";
import { setRefKey, type SetRef } from "../../lib/setRef.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { ACTIVE, FAIL } from "../../styles/palette.js";
import type { SetBinding } from "./useSetBinding.js";

const POP_W = 220;

export function SetBindingChip({ binding }: { binding: SetBinding }): JSX.Element {
    const gv = useGroups();
    const savedFunnels = useWorkbench((s) => s.savedFunnels);

    /** 고를 수 있는 참조들 — 연동/전체/활성 필터는 붙박이, 저장 필터·그룹은 사전에서. */
    const options = useMemo(() => {
        const fixed: { ref: SetRef | null; label: string }[] = [
            { ref: null, label: "연동" },
            { ref: { kind: "universe" }, label: "전체" },
            { ref: { kind: "filter", filterId: null }, label: "활성 필터" },
        ];
        const filters = savedFunnels.map((f) => ({ ref: { kind: "filter", filterId: f.id } as SetRef, label: f.name }));
        const groups = gv.groups.map((g) => ({ ref: { kind: "group", name: g.name } as SetRef, label: g.name, scope: g.scope }));
        return { fixed, filters, groups };
    }, [savedFunnels, gv.groups]);

    const currentKey = binding.ref === null ? null : setRefKey(binding.ref);
    const n = binding.view.viewedItems.length;

    return (
        <HeaderPopover width={POP_W} align="start" closeOnOutside
            trigger={(open, toggle) => (
                <button onClick={toggle} style={{ ...chip, ...(binding.broken ? { color: FAIL, borderColor: FAIL } : open ? { color: ACTIVE } : {}) }}
                    title={binding.broken
                        ? `${binding.label} — 참조가 깨졌습니다(지워진 대상). 눌러서 바꾸세요`
                        : `보는 집합: ${binding.label}${binding.ref !== null ? ` (${n})` : ""} — 눌러서 바꾸기`}>
                    {binding.broken ? "⚠ " : ""}{binding.label}
                    {binding.ref !== null && !binding.broken && <span style={{ color: "var(--text-tertiary)", marginLeft: 4 }}>{n}</span>}
                </button>
            )}>
            {(close) => (
                <div style={{ overflowY: "auto", padding: "4px 0", fontSize: 12 }}>
                    {binding.broken && (
                        <Row onClick={() => { binding.setRef({ kind: "universe" }); close(); }}>
                            <span style={{ color: FAIL }}>⚠ 참조가 깨짐 — <b>전체로 전환</b></span>
                        </Row>
                    )}
                    {options.fixed.map((o) => (
                        <Row key={o.ref === null ? "@linked" : setRefKey(o.ref)}
                            active={(o.ref === null ? null : setRefKey(o.ref)) === currentKey && !binding.broken}
                            onClick={() => { binding.setRef(o.ref); close(); }}>
                            {o.label}
                            {o.ref === null && <Hint>짚은 칸·활성 필터를 따라간다 (기본)</Hint>}
                        </Row>
                    ))}
                    {options.filters.length > 0 && <Head>저장 필터</Head>}
                    {options.filters.map((o) => (
                        <Row key={setRefKey(o.ref)} active={setRefKey(o.ref) === currentKey}
                            onClick={() => { binding.setRef(o.ref); close(); }}>{o.label}</Row>
                    ))}
                    {options.groups.length > 0 && <Head>그룹</Head>}
                    {options.groups.map((o) => (
                        <Row key={setRefKey(o.ref)} active={setRefKey(o.ref) === currentKey}
                            onClick={() => { binding.setRef(o.ref); close(); }}>
                            {o.label}
                            <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0 }}>
                                {o.scope === "day" ? "하루" : "타점"}
                            </span>
                        </Row>
                    ))}
                </div>
            )}
        </HeaderPopover>
    );
}

const chip: CSSProperties = {
    display: "inline-flex", alignItems: "center", maxWidth: 160, overflow: "hidden", whiteSpace: "nowrap",
    border: "1px solid var(--border-default)", borderRadius: 5, background: "transparent", cursor: "pointer",
    padding: "1px 6px", font: "inherit", fontSize: 11, color: "var(--text-secondary)", flexShrink: 0,
};

function Row({ active = false, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
    return (
        <button onClick={onClick} style={{
            display: "flex", width: "100%", alignItems: "center", gap: 6, textAlign: "left",
            border: "none", background: active ? "var(--bg-tertiary)" : "transparent", cursor: "pointer",
            padding: "4px 10px", font: "inherit", fontSize: 12,
            color: active ? ACTIVE : "var(--text-primary)", fontWeight: active ? 600 : 400,
        }}>
            {children}
        </button>
    );
}

const Head = ({ children }: { children: ReactNode }): JSX.Element => (
    <div style={{ padding: "5px 10px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-tertiary)", borderTop: "1px solid var(--border-default)", marginTop: 4 }}>
        {children}
    </div>
);

const Hint = ({ children }: { children: ReactNode }): JSX.Element => (
    <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 10, flexShrink: 0 }}>{children}</span>
);
