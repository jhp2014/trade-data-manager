import { useQuery } from "@tanstack/react-query";
import { useDock, PRESET_COUNT } from "../store/dock.js";
import { useWorkbench } from "../store/workbench.js";
import { useUi } from "../store/ui.js";
import { PANEL_CATALOG, type PanelEntry, type PanelPlane } from "../shell/panelCatalog.js";
import { stockMetaQuery } from "../api/queries.js";
import { DatePicker } from "./DatePicker.js";
import { StockNameCopy } from "./StockNameCopy.js";
import { fmtStampKo } from "../lib/date.js";
import { useLiveSnapshot } from "../api/live.js";
import { Popover } from "./Popover.js";
import { GearButton } from "../ui/controls.js";

// 하단 작업표시줄 — 작업화면(프리셋) 표시·순환 + 닫힌(최소화) 창 재오픈 + 종목/날짜/시간 컨텍스트(우측 구석).
// 컨텍스트는 상단 툴바 대신 여기로 이전: 텍스트처럼 보이되 클릭하면 편집(날짜는 data-aware 피커).
const SESSION_START_MIN = 8 * 60; // 08:00
const SESSION_END_MIN = 20 * 60; // 20:00
function minToTime(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
}
function timeToMin(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

const chipStyle: React.CSSProperties = {
    padding: "1px 8px",
    borderRadius: 4,
    border: "1px dashed var(--border-default)",
    background: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    font: "inherit",
};
// 플레인별 최소화 칩 — 테두리·글자를 플레인 색(실시간 앰버 / 복기·분석 teal)으로.
function planeChip(plane: PanelPlane): React.CSSProperties {
    return { ...chipStyle, border: `1px dashed var(--plane-${plane})`, color: `var(--plane-${plane})` };
}
function planeLabel(plane: PanelPlane): React.CSSProperties {
    return { fontSize: 10.5, fontWeight: 700, color: `var(--plane-${plane})` };
}
const sep: React.CSSProperties = { color: "var(--border-default)" };
function textBtn(active = false): React.CSSProperties {
    return {
        background: active ? "var(--bg-tertiary)" : "none",
        border: "none",
        borderRadius: 5,
        padding: "2px 6px",
        color: "var(--text-primary)",
        cursor: "pointer",
        font: "inherit",
    };
}

// 종목 — 이름만 표시(코드 숨김), 클릭하면 종목코드 클립보드 복사(HTS 붙여넣기 연동).
function NameCopyControl({ code }: { code: string }): JSX.Element {
    const meta = useQuery(stockMetaQuery(code));
    return <StockNameCopy code={code} name={meta.data?.[0]?.name} style={{ ...textBtn(), cursor: code ? "pointer" : "default" }} />;
}

// 시간 — 텍스트로 보이다 클릭하면 시각 스크러버(08:00~20:00) 팝오버. 버스별 time/setTime 을 prop 으로 받는다.
function TimeControl({ time, setTime }: { time: string | null; setTime: (t: string | null) => void }): JSX.Element {
    const curMin = time ? timeToMin(time) : 15 * 60 + 30; // 기본 15:30
    return (
        <Popover trigger={(open, toggle) => (
            <button onClick={toggle} title="시간 선택" style={textBtn(open)}>{time ? time.slice(0, 5) : "시간"}</button>
        )}>
            {() => (
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: 220 }}>
                    <span className="tabular" style={{ fontWeight: 700, width: 40, color: "var(--text-primary)" }}>{minToTime(curMin).slice(0, 5)}</span>
                    <input
                        type="range"
                        min={SESSION_START_MIN}
                        max={SESSION_END_MIN}
                        value={curMin}
                        onChange={(e) => setTime(minToTime(Number(e.target.value)))}
                        style={{ flex: 1, accentColor: "var(--accent-primary)" }}
                    />
                </div>
            )}
        </Popover>
    );
}

// 복기 버스 컨텍스트(🟢) — 종목·날짜·시간(설정 가능).
function EodPlaneCtx({ code, date, setDate, time, setTime }: {
    code: string;
    date: string;
    setDate: (d: string) => void;
    time: string | null;
    setTime: (t: string | null) => void;
}): JSX.Element {
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--plane-eod)", flexShrink: 0, marginRight: 2 }} title="복기" />
            <NameCopyControl code={code} />
            <span style={sep}>·</span>
            <DatePicker value={date} onChange={setDate} />
            <span style={sep}>·</span>
            <TimeControl time={time} setTime={setTime} />
        </span>
    );
}

// 실시간 버스 컨텍스트(🟠) — 종목 + 연결상태 + 최근 폴링시각(날짜/시간 설정 불필요, 항상 now).
function LivePlaneCtx({ code }: { code: string }): JSX.Element {
    const { snapshot } = useLiveSnapshot();
    const live = snapshot?.status === "live";
    const polled = snapshot?.ts ? fmtStampKo(snapshot.ts) : null;
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }} title={`실시간 연결: ${snapshot?.status ?? "끊김"}`}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: live ? "var(--plane-live)" : "var(--text-tertiary)", flexShrink: 0 }} />
            <NameCopyControl code={code} />
            <span style={{ color: live ? "var(--plane-live)" : "var(--text-tertiary)", fontSize: 11 }}>{live ? "● 실시간" : `○ ${snapshot?.status ?? "끊김"}`}</span>
            {polled && <span className="tabular" style={{ color: "var(--text-tertiary)", fontSize: 11 }} title="최근 폴링 시각">{polled}</span>}
        </span>
    );
}

export function Taskbar(): JSX.Element {
    const activePreset = useDock((s) => s.activePreset);
    const savedCount = useDock((s) => s.presets.filter(Boolean).length);
    const cyclePreset = useDock((s) => s.cyclePreset);
    const openPanelIds = useDock((s) => s.openPanelIds);
    const api = useDock((s) => s.api);
    // 복기 버스(focus) + 실시간 버스(liveFocus) — 둘 다 표시.
    const focusCode = useWorkbench((s) => s.focus.code);
    const date = useWorkbench((s) => s.focus.date);
    const focusTime = useWorkbench((s) => s.focus.time);
    const setDate = useWorkbench((s) => s.setDate);
    const setTime = useWorkbench((s) => s.setTime);
    const liveCode = useWorkbench((s) => s.liveFocus.code);
    const openSettings = useUi((s) => s.openSettings);
    // 카탈로그에 있으나 현재 안 열린 = 최소화된 창. dock 미준비(null)면 비움. 플레인별로 나눠 그룹 표시.
    const closed = openPanelIds === null ? [] : PANEL_CATALOG.filter((p) => !openPanelIds.includes(p.id));
    const liveClosed = closed.filter((p) => p.plane === "live");
    const eodClosed = closed.filter((p) => p.plane === "eod");
    const reopen = (e: PanelEntry): void => {
        api?.addPanel({ id: e.id, component: e.component, title: e.title });
    };
    const chips = (items: PanelEntry[], plane: PanelPlane): JSX.Element[] =>
        items.map((e) => (
            <button key={e.id} onClick={() => reopen(e)} title="다시 열기" style={planeChip(plane)}>
                {e.title}
            </button>
        ));
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 28,
                padding: "0 10px",
                borderTop: "1px solid var(--border-default)",
                background: "var(--bg-secondary)",
                fontSize: 12,
                color: "var(--text-tertiary)",
                flexShrink: 0,
            }}
        >
            <button
                onClick={cyclePreset}
                disabled={savedCount === 0}
                title={savedCount ? `작업화면 순환 (Ctrl+1~${PRESET_COUNT} 전환)` : "저장된 작업화면 없음 (설정 → 레이아웃)"}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 8px",
                    borderRadius: 5,
                    border: "1px solid var(--border-subtle)",
                    background: savedCount ? "var(--bg-primary)" : "none",
                    color: activePreset ? "var(--text-primary)" : "var(--text-tertiary)",
                    cursor: savedCount ? "pointer" : "default",
                    font: "inherit",
                }}
            >
                화면 {activePreset ?? "—"}
            </button>
            {closed.length > 0 && (
                <>
                    <span style={sep}>│</span>
                    {liveClosed.length > 0 && (
                        <>
                            <span style={planeLabel("live")}>실시간</span>
                            {chips(liveClosed, "live")}
                        </>
                    )}
                    {liveClosed.length > 0 && eodClosed.length > 0 && <span style={sep}>│</span>}
                    {eodClosed.length > 0 && (
                        <>
                            <span style={planeLabel("eod")}>복기·분석</span>
                            {chips(eodClosed, "eod")}
                        </>
                    )}
                </>
            )}
            {/* 우측 구석: 실시간(🟠) / 복기(🟢) 두 버스 컨텍스트 + 설정 */}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <LivePlaneCtx code={liveCode} />
                <span style={sep}>│</span>
                <EodPlaneCtx code={focusCode} date={date} setDate={setDate} time={focusTime} setTime={setTime} />
                <span style={sep}>│</span>
                <GearButton onClick={() => openSettings()} />
            </span>
        </div>
    );
}
