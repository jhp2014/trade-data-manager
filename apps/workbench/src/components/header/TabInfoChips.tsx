// 탭 뒤 정보 칩 — 배치 장부가 "탭"으로 보낸 정보 조각. 탭명과 확실히 갈리도록 **흰 바탕 칩**이다
// (탭 바탕이 플레인 tint 라 흰 칩이 또렷하다 — 채운 알약은 w/s 칩·플레인 색과 경쟁해 기각).
// 그룹마다 **보이는 탭**에만 붙는다(visible — 배경 탭까지 달면 탭 줄이 시끄럽다, 사용자 확정).
// 값이 바뀔 때의 폭 출렁임은 tabular + 짧은 포맷이 막는다 — 긴 정보는 첫 줄/바닥 몫이다.
import { useHeaderLedger, linesOf, typeKeyOf } from "./ledger.js";
import { useHeaderDecl } from "./registry.js";
import { EMPTY_DECL, type InfoSpec } from "./spec.js";

export function TabInfoChips({ panelId, visible }: { panelId: string; visible: boolean }): JSX.Element | null {
    const decl = useHeaderDecl(panelId) ?? EMPTY_DECL;
    const entry = useHeaderLedger((s) => s.layout[typeKeyOf(panelId)]);
    if (!visible) return null;
    const tab = linesOf(decl, entry).tab;
    if (tab.length === 0) return null;
    return (
        <>
            {tab.map((i) => <TabChip key={i.id} spec={i} />)}
        </>
    );
}

function TabChip({ spec }: { spec: InfoSpec }): JSX.Element | null {
    // renderTab > text > renderLine — 마지막 폴백이 없으면 renderLine 전용 조각(배지류·text 늘 null)을
    // 탭으로 보냈을 때 첫 줄에서도 탭에서도 **조용히 사라진다**(리뷰가 잡은 자리). 배지가 칩 안에 서면
    // 어색할 수는 있어도, 보이는 어색함이 안 보이는 소멸보다 낫다.
    const text = spec.renderTab === undefined ? spec.text() : null;
    const body = spec.renderTab !== undefined ? spec.renderTab()
        : text ?? (spec.renderLine !== undefined ? spec.renderLine() : null);
    if (body === null) return null;
    // renderLine 폴백은 칩 껍데기 없이 — 요소가 속으로 null 을 그릴 수 있어(SubjectBadge 평상시),
    // 흰 바탕·padding 을 씌우면 빈 알약만 남는다. 껍데기가 없으면 빈 속 = 아무것도 안 보인다.
    if (spec.renderTab === undefined && text === null) {
        return <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>{body}</span>;
    }
    return (
        <span className={spec.tabular === true ? "tabular" : undefined} title={spec.help ?? spec.name}
            style={{
                fontSize: 10.5, lineHeight: "15px", padding: "0 6px", borderRadius: 3, flexShrink: 0,
                background: "rgba(255,255,255,0.8)", color: "var(--text-secondary)",
                fontWeight: 400, whiteSpace: "nowrap",
            }}>
            {body}
        </span>
    );
}
