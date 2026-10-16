// 설정 창(⚙ · Ctrl+, · ? = 단축키 칸) — 왼쪽 칸 목록 + 오른쪽 내용. workbench components/SettingsModal.tsx 의 틀.
// 칸: 경로(추가·삭제) · 패널(새 패널 열기) · 화면(저장·불러오기·번호) · 차트(시각 이동 폭·f 줌 봉 수) · 단축키(도움말 — 레지스트리에서 파생).
import type { ReactNode } from "react";
import type { DockviewApi } from "dockview-react";
import { useUi, type SettingsSection } from "../store/ui.js";
import { usePaths, type Path } from "../store/paths.js";
import { useStockName } from "../market/queries.js";
import { useConfirm } from "../ui/ConfirmBar.js";
import { stockLabel, summarizeSituation } from "./pathSummary.js";
import { PathBadge } from "./PathBadge.js";
import { CHART_SETTING_RANGES, useChartSettings, type ChartSettings } from "../store/chartSettings.js";
import { useKeymapDynamic } from "../keymap/dynamic.js";
import { allCommands, commandsByCategory } from "../keymap/registry.js";
import { formatChord } from "../keymap/keys.js";
import { Dialog } from "../ui/Dialog.js";
import { NumberField } from "../ui/chrome.js";
import { ScrollRow } from "../ui/ScrollRow.js";
import { PANEL_TYPES } from "./panelCatalog.js";
import { openPanel } from "./layout.js";
import { ScreenManager } from "./ScreenManager.js";

const SECTIONS: readonly { id: SettingsSection; label: string }[] = [
    { id: "paths", label: "경로" },
    { id: "panels", label: "패널" },
    { id: "screens", label: "화면" },
    { id: "chart", label: "차트" },
    { id: "shortcuts", label: "단축키" },
];

export function SettingsModal({ api }: { api: DockviewApi | null }): JSX.Element | null {
    const open = useUi((st) => st.settingsOpen);
    const close = useUi((st) => st.closeSettings);
    if (!open) return null;
    return <SettingsBody api={api} onClose={close} />;
}

function SettingsBody({ api, onClose }: { api: DockviewApi | null; onClose: () => void }): JSX.Element {
    const section = useUi((st) => st.settingsSection);
    const setSection = useUi((st) => st.setSettingsSection);
    return (
        <Dialog title="설정" width={600} height={460} onClose={onClose}>
            <nav style={{ width: 110, flexShrink: 0, borderRight: "1px solid var(--border)", padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {SECTIONS.map((s) => (
                    <button
                        key={s.id}
                        className="menu-item"
                        {...(s.id === section ? { "data-selected": "" } : {})}
                        onClick={() => setSection(s.id)}
                        style={{ border: "none", borderRadius: 5, padding: "5px 10px", textAlign: "left", cursor: "pointer", fontSize: 12, fontWeight: s.id === section ? 700 : 400 }}
                    >
                        {s.label}
                    </button>
                ))}
            </nav>
            <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "10px 14px" }}>
                {section === "paths" && <PathsSection />}
                {section === "panels" && <PanelsSection api={api} onDone={onClose} />}
                {section === "screens" && (api ? <ScreenManager api={api} onDone={onClose} /> : null)}
                {section === "chart" && <ChartSection />}
                {section === "shortcuts" && <ShortcutsSection />}
            </div>
        </Dialog>
    );
}

function Hint({ children }: { children: ReactNode }): JSX.Element {
    return <p style={{ color: "var(--text-3)", fontSize: 11, margin: "0 0 10px" }}>{children}</p>;
}

/** 경로 목록 — 추가(활성 경로의 상황을 복사해 펼친 채 활성으로) · 삭제(확인 줄, 마지막 하나는 못 지운다). */
function PathsSection(): JSX.Element {
    const paths = usePaths((st) => st.paths);
    const { ask, bar } = useConfirm();
    return (
        <>
            <Hint>경로 = 보는 상황 하나(날짜·시각·종목). 경로 줄의 이름표를 누르면 그 경로가 활성(경로 색 고리 — a/d 가 시각을 움직이는 경로), 마우스를 올리면 나오는 ▸/◂ 로 펼치고 접는다.</Hint>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 440 }}>
                {paths.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 26 }}>
                        {bar(p.id) ?? (
                            <PathRow
                                path={p}
                                onRemove={paths.length > 1 ? () => ask(p.id, `경로 ${p.id} 를 지울까요? 이 경로를 보던 패널은 활성 경로를 따라간다.`, "지우기", () => usePaths.getState().removePath(p.id)) : null}
                            />
                        )}
                    </div>
                ))}
            </div>
            <button onClick={() => usePaths.getState().addPath()} title="활성 경로의 상황을 복사해 새 경로를 만든다" style={{ ...sectionBtn, marginTop: 10 }}>
                + 경로 추가
            </button>
        </>
    );
}

function PathRow({ path, onRemove }: { path: Path; onRemove: (() => void) | null }): JSX.Element {
    const name = useStockName(path.s.code);
    const isActive = usePaths((st) => st.active === path.id);
    return (
        <>
            <PathBadge path={path} />
            <span className="tabular" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {summarizeSituation(path.s, stockLabel(path.s.code, name))}
                {isActive && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>활성</span>}
            </span>
            {onRemove && (
                <button onClick={onRemove} style={{ ...sectionBtn, fontSize: 11, padding: "0 6px" }}>
                    지우기
                </button>
            )}
        </>
    );
}

const sectionBtn: React.CSSProperties = { padding: "4px 12px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface)", cursor: "pointer", fontSize: 12 };

function PanelsSection({ api, onDone }: { api: DockviewApi | null; onDone: () => void }): JSX.Element {
    return (
        <>
            <Hint>새 패널은 활성 경로를 따라간다(탭의 경로 칩으로 바꾼다). 최소화한 패널은 바닥 작업표시줄에서 되살린다.</Hint>
            <ScrollRow gap={6}>
                {PANEL_TYPES.map((t) => (
                    <button
                        key={t.base}
                        disabled={!api}
                        title={`${t.title} 패널 열기`}
                        onClick={() => {
                            if (!api) return;
                            openPanel(api, t.base);
                            onDone();
                        }}
                        style={{ ...sectionBtn, flexShrink: 0 }}
                    >
                        + {t.title}
                    </button>
                ))}
            </ScrollRow>
        </>
    );
}

const CHART_FIELDS: readonly { key: keyof ChartSettings; label: string }[] = [
    { key: "jumpBars", label: "Shift + A / D 한 번에 옮기는 분" },
    { key: "minuteZoomBars", label: "F 줌 — 분봉 봉 수(시각 선 가운데)" },
    { key: "dailyZoomBars", label: "F 줌 — 일봉 봉 수(경로 날짜까지)" },
    { key: "dailyZoomOutBars", label: "줌 해제 — 일봉 봉 수" },
];

function ChartSection(): JSX.Element {
    const settings = useChartSettings((st) => st.settings);
    const set = useChartSettings((st) => st.set);
    return (
        <>
            <Hint>A / D = 활성 경로의 시각을 분봉 한 칸. F = 모든 차트 줌 토글.</Hint>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", alignItems: "center", maxWidth: 380 }}>
                {CHART_FIELDS.map(({ key, label }) => {
                    const r = CHART_SETTING_RANGES[key];
                    return (
                        <label key={key} style={{ display: "contents" }}>
                            <span>{label}</span>
                            <NumberField value={settings[key]} onCommit={(v) => set({ [key]: v })} width={56} title={`${r.min} ~ ${r.max}`} />
                        </label>
                    );
                })}
            </div>
        </>
    );
}

function ShortcutsSection(): JSX.Element {
    const dynamic = useKeymapDynamic((st) => st.commands); // 화면 번호·차트 키가 오르내리면 도움말도 따라간다
    const groups = commandsByCategory(allCommands(dynamic));
    return (
        <>
            <Hint>검색칸 같은 입력칸에 글자를 칠 땐 글자 키 단축키(A·D·F·?)가 쉰다.</Hint>
            {groups.map((g) => (
                <section key={g.category} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>{g.category}</div>
                    {g.items.map((c) => (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "3px 0" }}>
                            <span style={{ flex: 1 }}>{c.title}</span>
                            <kbd className="tabular" style={{ fontFamily: "inherit", fontSize: 11, padding: "1px 6px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg-secondary)" }}>
                                {formatChord(c.keys)}
                            </kbd>
                        </div>
                    ))}
                </section>
            ))}
        </>
    );
}
