// 정보 판 — 이 패널의 정보 **전부**의 지금 값 + 어디에 보일지(숨김/탭/줄/바닥). 숨긴 정보도 여기서는
// 늘 읽힌다 — "숨김"은 접기이지 상실이 아니라서 안심하고 숨길 수 있다. 자리는 패널 종류 단위로 남는다.
import { infoPlaceOf, typeKeyOf, useHeaderLedger } from "./ledger.js";
import { useHeaderDecl } from "./registry.js";
import { InfoValue } from "./PanelFrame.js";
import type { InfoPlace, InfoSpec } from "./spec.js";

const PLACES: readonly { place: InfoPlace; label: string; help: string }[] = [
    { place: "hidden", label: "숨김", help: "줄에서 내린다 — 이 판에서는 계속 읽힌다" },
    { place: "tab", label: "탭", help: "탭 이름 뒤 — 짧고 폭이 안정적인 값에" },
    { place: "line", label: "줄", help: "본문 위 헤더 줄" },
    { place: "bottom", label: "바닥", help: "본문 아래 정보 줄" },
];

export function InfoBoard({ panelId }: { panelId: string }): JSX.Element {
    const typeKey = typeKeyOf(panelId);
    const decl = useHeaderDecl(panelId);
    const infos = (decl?.info ?? []).filter((i) => i.transient !== true);
    return (
        <div style={{ overflowY: "auto", fontSize: 11.5, padding: "4px 0" }}>
            {infos.length === 0 && <div style={{ padding: "6px 12px", color: "var(--text-tertiary)" }}>이 패널에는 정보가 없습니다</div>}
            {infos.map((i) => (
                <InfoRow key={i.id} spec={i} typeKey={typeKey} />
            ))}
            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 4, padding: "4px 12px 1px", fontSize: 10, color: "var(--text-tertiary)" }}>
                자리는 같은 종류 패널 모두에 적용됩니다
            </div>
        </div>
    );
}

function InfoRow({ spec, typeKey }: { spec: InfoSpec; typeKey: string }): JSX.Element {
    const entry = useHeaderLedger((s) => s.layout[typeKey]);
    const place = infoPlaceOf(spec, entry);
    return (
        <div data-info-row={spec.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px" }}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, overflow: "hidden", whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--text-primary)", flexShrink: 0 }}>{spec.name}</span>
                <InfoValue spec={spec} />
            </span>
            <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                {PLACES.map((p) => (
                    <button
                        key={p.place}
                        title={p.help}
                        aria-pressed={place === p.place}
                        onClick={() => useHeaderLedger.getState().setInfoPlace(typeKey, spec, p.place)}
                        style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 3, border: "none", cursor: "pointer",
                            background: place === p.place ? "var(--accent-primary)" : "none",
                            color: place === p.place ? "#fff" : "var(--text-tertiary)",
                            fontWeight: place === p.place ? 500 : 400,
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </span>
        </div>
    );
}
