import { useState } from "react";
import { Modal } from "./Modal.js";
import { useWorkbench } from "../store/workbench.js";

// 전역 설정 모달 — 사이드바에서 화면 선택 → 그 화면 설정. 패널별 gear 대신 우상단 전역 1개.
type Screen = "issue" | "replay";

const numInput: React.CSSProperties = {
    width: 56,
    border: "1px solid var(--border-default)",
    borderRadius: 4,
    padding: "1px 4px",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    font: "inherit",
};

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
    const [screen, setScreen] = useState<Screen>("issue");
    return (
        <Modal title="설정" onClose={onClose}>
            <div style={{ display: "flex", gap: 14, minWidth: 380 }}>
                {/* 사이드바 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, borderRight: "1px solid var(--border-subtle)", paddingRight: 12 }}>
                    {(["issue", "replay"] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setScreen(s)}
                            style={{
                                textAlign: "left",
                                padding: "5px 10px",
                                borderRadius: 6,
                                background: screen === s ? "var(--accent-soft)" : "none",
                                color: screen === s ? "var(--accent-hover)" : "var(--text-secondary)",
                                fontWeight: screen === s ? 700 : 400,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {s === "issue" ? "당일 이슈" : "복기"}
                        </button>
                    ))}
                </div>
                {/* 내용 */}
                <div style={{ flex: 1, minWidth: 0 }}>{screen === "issue" ? <IssueSettings /> : <ReplaySettings />}</div>
            </div>
        </Modal>
    );
}

function IssueSettings(): JSX.Element {
    const st = useWorkbench((s) => s.issueSettings);
    const set = useWorkbench((s) => s.setIssueSettings);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={st.showIndividuals} onChange={(e) => set({ showIndividuals: e.target.checked })} style={{ accentColor: "var(--accent-primary)" }} />
                개별 종목 카드 표시
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={st.showUnclassified} onChange={(e) => set({ showUnclassified: e.target.checked })} style={{ accentColor: "var(--accent-primary)" }} />
                미분류 카드 표시
            </label>

            <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                <input type="checkbox" checked={st.filterOn} onChange={(e) => set({ filterOn: e.target.checked })} style={{ accentColor: "var(--accent-primary)" }} />
                종목 필터
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: st.filterOn ? 1 : 0.5, pointerEvents: st.filterOn ? "auto" : "none", paddingLeft: 22 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    고가 등락률 ≥
                    <input type="number" value={st.filterHighGte} onChange={(e) => set({ filterHighGte: Number(e.target.value) })} style={numInput} /> %
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    거래대금 ≥
                    <input type="number" value={st.filterAmountEok} onChange={(e) => set({ filterAmountEok: Number(e.target.value) })} style={numInput} /> 억
                </label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span>결합</span>
                    {(["and", "or"] as const).map((c) => (
                        <label key={c} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="radio" name="combine" checked={st.filterCombine === c} onChange={() => set({ filterCombine: c })} style={{ accentColor: "var(--accent-primary)" }} />
                            {c.toUpperCase()}
                        </label>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span>불일치 종목</span>
                    {(["dim", "hide"] as const).map((m) => (
                        <label key={m} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="radio" name="filterMode" checked={st.filterMode === m} onChange={() => set({ filterMode: m })} style={{ accentColor: "var(--accent-primary)" }} />
                            {m === "dim" ? "흐리게" : "숨김"}
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ReplaySettings(): JSX.Element {
    const st = useWorkbench((s) => s.replaySettings);
    const set = useWorkbench((s) => s.setReplaySettings);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>시점 유니버스 = 두 랭킹의 합집합</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                거래대금 상위
                <input type="number" value={st.amountN} min={0} onChange={(e) => set({ amountN: Number(e.target.value) })} style={numInput} /> 종목
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                등락률 상위
                <input type="number" value={st.rateN} min={0} onChange={(e) => set({ rateN: Number(e.target.value) })} style={numInput} /> 종목
            </label>
        </div>
    );
}
