// 탭 뒤 정보 — 자리 장부가 "탭"으로 보낸 정보 조각. **점(·) 구분 + 옅은 글자**(workbench 확정 — 흰 칩은
// "탭 안의 덩어리" 소음이었다). 탭 이름과 크기·굵기·색이 이미 갈려 껍데기가 필요 없다.
// 그룹마다 **보이는 탭**에만 붙는다(배경 탭까지 달면 탭 줄이 시끄럽다). 긴 정보는 헤더 줄·바닥 몫이다.
import { linesOf, typeKeyOf, useHeaderLedger } from "./ledger.js";
import { useHeaderDecl } from "./registry.js";
import { EMPTY_DECL } from "./spec.js";

export function TabInfoChips({ panelId, visible }: { panelId: string; visible: boolean }): JSX.Element | null {
    const decl = useHeaderDecl(panelId) ?? EMPTY_DECL;
    const entry = useHeaderLedger((s) => s.layout[typeKeyOf(panelId)]);
    if (!visible) return null;
    return (
        <>
            {linesOf(decl, entry).tab.map((spec) => {
                const text = spec.text();
                if (text === null) return null;
                return (
                    <span
                        key={spec.id}
                        className={spec.tabular === true ? "tabular" : undefined}
                        title={spec.help ?? spec.name}
                        style={{ fontSize: 10.5, color: "var(--text-secondary)", fontWeight: 400, whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                        {"· "}
                        {text}
                    </span>
                );
            })}
        </>
    );
}
