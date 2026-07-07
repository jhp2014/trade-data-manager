import { useState } from "react";
import { Dialog } from "../ui/Dialog.js";
import { Checkbox, NumberField, Radio, Row, SectionLabel, TextInput, Kbd } from "../ui/controls.js";
import { useWorkbench } from "../store/workbench.js";
import { useUi, type SettingsScreen } from "../store/ui.js";
import { useDock } from "../store/dock.js";
import { staticCommands, commandsByCategory } from "../keymap/registry.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { formatChord } from "../keymap/keys.js";

// 전역 설정 다이얼로그 — 사이드바에서 화면 선택 → 그 화면 설정. 패널별 gear 대신 우상단 전역 1개.
// 프레임은 고정(폭·높이) — 화면을 바꿔도 창이 안 출렁이게, 내용 영역만 내부 스크롤한다.
type Screen = SettingsScreen;
const SCREENS: { id: Screen; label: string }[] = [
    { id: "theme", label: "테마" },
    { id: "replay", label: "복기" },
    { id: "point", label: "타점" },
    { id: "layout", label: "레이아웃" },
    { id: "shortcuts", label: "단축키" },
];

const divider: React.CSSProperties = { height: 1, background: "var(--border-subtle)", margin: "4px 0" };

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
    // 열릴 때 UI 스토어가 지정한 화면으로 시작(커맨드가 "단축키" 화면으로 바로 열 수 있게).
    const [screen, setScreen] = useState<Screen>(() => useUi.getState().settingsScreen);
    return (
        <Dialog title="설정" onClose={onClose} width={560} height={440} padding={0}>
            <div style={{ display: "flex", height: "100%" }}>
                {/* 사이드바 — 고정폭 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, width: 120, borderRight: "1px solid var(--border-subtle)", padding: "14px 12px" }}>
                    {SCREENS.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => setScreen(id)}
                            style={{
                                textAlign: "left",
                                padding: "5px 10px",
                                borderRadius: 6,
                                background: screen === id ? "var(--accent-soft)" : "none",
                                color: screen === id ? "var(--accent-hover)" : "var(--text-secondary)",
                                fontWeight: screen === id ? 700 : 400,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {/* 내용 — 프레임 고정, 여기만 스크롤 */}
                <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
                    {screen === "theme" ? <ThemeSettings /> : screen === "replay" ? <ReplaySettings /> : screen === "point" ? <PointSettings /> : screen === "layout" ? <LayoutSettings /> : <ShortcutSettings />}
                </div>
            </div>
        </Dialog>
    );
}

function ThemeSettings(): JSX.Element {
    const st = useWorkbench((s) => s.themeBoardSettings);
    const set = useWorkbench((s) => s.setThemeBoardSettings);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row>
                <Checkbox checked={st.showIndividuals} onChange={(e) => set({ showIndividuals: e.target.checked })} />
                개별 종목 카드 표시
            </Row>
            <Row>
                <Checkbox checked={st.showUnclassified} onChange={(e) => set({ showUnclassified: e.target.checked })} />
                미분류 카드 표시
            </Row>

            <div style={divider} />
            <Row style={{ fontWeight: 600 }}>
                <Checkbox checked={st.filterOn} onChange={(e) => set({ filterOn: e.target.checked })} />
                종목 필터
            </Row>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: st.filterOn ? 1 : 0.5, pointerEvents: st.filterOn ? "auto" : "none", paddingLeft: 22 }}>
                <Row gap={6}>
                    고가 등락률 ≥
                    <NumberField value={st.filterHighGte} onChange={(e) => set({ filterHighGte: Number(e.target.value) })} /> %
                </Row>
                <Row gap={6}>
                    거래대금 ≥
                    <NumberField value={st.filterAmountEok} onChange={(e) => set({ filterAmountEok: Number(e.target.value) })} /> 억
                </Row>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span>결합</span>
                    {(["and", "or"] as const).map((c) => (
                        <Row key={c} gap={4}>
                            <Radio name="combine" checked={st.filterCombine === c} onChange={() => set({ filterCombine: c })} />
                            {c.toUpperCase()}
                        </Row>
                    ))}
                </div>
                <Row style={{ fontWeight: 600 }}>
                    <Checkbox checked={st.filterNewHigh} onChange={(e) => set({ filterNewHigh: e.target.checked })} />
                    신고가 근접
                </Row>
                <Row gap={6} style={{ opacity: st.filterNewHigh ? 1 : 0.5, pointerEvents: st.filterNewHigh ? "auto" : "none", paddingLeft: 22, flexWrap: "wrap" }}>
                    <NumberField value={st.filterNewHighWindow} min={1} onChange={(e) => set({ filterNewHighWindow: Number(e.target.value) })} />거래일 내 최고가의
                    <NumberField value={st.filterNewHighTolerance} min={0} step={0.5} onChange={(e) => set({ filterNewHighTolerance: Number(e.target.value) })} /> % 이내
                </Row>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span>불일치 종목</span>
                    {(["dim", "hide"] as const).map((m) => (
                        <Row key={m} gap={4}>
                            <Radio name="filterMode" checked={st.filterMode === m} onChange={() => set({ filterMode: m })} />
                            {m === "dim" ? "흐리게" : "숨김"}
                        </Row>
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
            <Row>
                거래대금 상위
                <NumberField value={st.amountN} min={0} onChange={(e) => set({ amountN: Number(e.target.value) })} /> 종목
            </Row>
            <Row>
                등락률 상위
                <NumberField value={st.rateN} min={0} onChange={(e) => set({ rateN: Number(e.target.value) })} /> 종목
            </Row>
        </div>
    );
}

// 타점 셋업 유형 프리셋 — 숫자키 1~9 슬롯. 분봉 차트에서 그 키로 현재 타점에 유형 입력.
function PointSettings(): JSX.Element {
    const presets = useWorkbench((s) => s.reviewTypePresets);
    const set = useWorkbench((s) => s.setReviewTypePreset);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>분봉 차트에서 숫자키(1~9)로 현재 타점에 셋업 유형 입력. 빈 슬롯은 무시.</div>
            {presets.map((v, i) => (
                <Row key={i}>
                    <span style={{ width: 18, textAlign: "center", fontWeight: 700, color: "var(--accent-hover)" }}>{i + 1}</span>
                    <TextInput value={v} onChange={(e) => set(i, e.target.value)} placeholder="(미설정)" style={{ flex: 1 }} />
                </Row>
            ))}
        </div>
    );
}

// 단축키 도움말 — 커맨드 레지스트리에서 카테고리별로 자동 생성(추가된 커맨드가 즉시 반영, 문구가 안 낡음).
function ShortcutSettings(): JSX.Element {
    // 정적 + 동적(차트 등 마운트된 패널이 등록) 합본. 동적 스토어를 구독해 등록 변화에 반응.
    const dynamic = useKeymapDynamic((s) => s.commands);
    const groups = commandsByCategory([...staticCommands, ...Object.values(dynamic)]);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {groups.map((g) => (
                <div key={g.category} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <SectionLabel caps>{g.category}</SectionLabel>
                    {g.items.map((c) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                            <span style={{ color: "var(--text-primary)" }}>{c.title}</span>
                            <Kbd>{formatChord(c.keys)}</Kbd>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// 레이아웃 프리셋 — 현재 창 배치를 슬롯에 저장/불러오기. 전환은 Ctrl+숫자 또는 하단 작업표시줄 클릭.
function LayoutSettings(): JSX.Element {
    const presets = useDock((s) => s.presets);
    const activePreset = useDock((s) => s.activePreset);
    const savePreset = useDock((s) => s.savePreset);
    const loadPreset = useDock((s) => s.loadPreset);
    const btn: React.CSSProperties = {
        border: "1px solid var(--border-default)",
        borderRadius: 5,
        padding: "3px 10px",
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
        cursor: "pointer",
        font: "inherit",
    };
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>현재 창 배치를 슬롯에 저장. Ctrl+숫자 또는 하단 작업표시줄 클릭으로 전환.</div>
            {presets.map((p, i) => {
                const n = i + 1;
                const filled = !!p;
                return (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: activePreset === n ? "var(--accent-hover)" : "var(--text-primary)" }}>화면 {n}</span>
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{activePreset === n ? "(현재)" : filled ? "저장됨" : "비어 있음"}</span>
                        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                            <button style={btn} onClick={() => savePreset(n)}>현재 배치 저장</button>
                            <button style={{ ...btn, opacity: filled ? 1 : 0.4, cursor: filled ? "pointer" : "default" }} disabled={!filled} onClick={() => loadPreset(n)}>불러오기</button>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
