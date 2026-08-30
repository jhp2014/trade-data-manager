import { useEffect, useState } from "react";
import { useDock, PRESET_COUNT } from "../store/dock.js";
import { useWorkbench } from "../store/workbench.js";
import { useUi } from "../store/ui.js";
import { PANEL_CATALOG, type PanelEntry, type PanelPlane } from "../shell/panelCatalog.js";
import { useStockName } from "../lib/useStockName.js";
import { DatePicker } from "./DatePicker.js";
import { StockNameCopy } from "./StockNameCopy.js";
import { fmtStampKo } from "../lib/date.js";
import { useLiveSnapshot } from "../lib/LiveSnapshotContext.js";
import { useHorizontalWheel } from "../lib/useHorizontalWheel.js";
import { Popover } from "./Popover.js";
import { GearButton } from "../ui/controls.js";
import { MirrorSync } from "./MirrorSync.js";

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
    whiteSpace: "nowrap", // 폭 좁아도 글자 줄바꿈 금지 — 스트립이 대신 가로 스크롤
    flexShrink: 0,
};
// 플레인별 최소화 칩 — 테두리·글자를 플레인 색(실시간 앰버 / 복기·분석 teal)으로.
function planeChip(plane: PanelPlane): React.CSSProperties {
    return { ...chipStyle, border: `1px dashed var(--plane-${plane})`, color: `var(--plane-${plane})` };
}
const sep: React.CSSProperties = { color: "var(--border-default)", flexShrink: 0 };
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
    const name = useStockName(code);
    // 좁은 폭에서 컨텍스트가 줄어야 할 때 여기가 먼저 말줄임된다(다른 조각은 flexShrink 0).
    return <StockNameCopy code={code} name={name ?? undefined} style={{ ...textBtn(), cursor: code ? "pointer" : "default", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} />;
}

// 시간 — 텍스트로 보이다 클릭하면 시각 스크러버(08:00~20:00) 팝오버. 버스별 time/setTime 을 prop 으로 받는다.
function TimeControl({ time, setTime }: { time: string | null; setTime: (t: string | null) => void }): JSX.Element {
    const curMin = time ? timeToMin(time) : 15 * 60 + 30; // 기본 15:30
    return (
        <Popover trigger={(open, toggle) => (
            <button onClick={toggle} title="시간 선택" style={{ ...textBtn(open), padding: "2px 4px" }}>{time ? time.slice(0, 5) : "시간"}</button>
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

// 플레인 그룹 공통 골격 — 좌측 컨텍스트(라벨·종목·날짜/시간) + 우측 가로 스크롤 칩 스트립.
// region 은 작업표시줄 가운데를 나눠 갖는다. basis=auto(내용 기준) — 칩이 많은 쪽이 더 넓게 시작하고,
// 모자라면 각자 내용 비례로 줄어든다(옛 1 1 0 50/50 고정은 한쪽 컨텍스트가 절반을 넘기면 칩이 0px 로 찌부러졌다).
const REGION: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, flex: "1 1 auto", minWidth: 0, overflow: "hidden" };
// 컨텍스트도 줄어든다 — 줄어드는 건 종목명 하나(위 말줄임), 나머지 조각은 flexShrink 0 으로 원형 유지.
// 그래도 모자라는 좁은 폭에서는 플레인 라벨 텍스트를 통째로 감춘다(.plane-label, theme.css 미디어쿼리) —
// 플레인은 색 점·칩 색이 이미 말해주므로 라벨은 여기서 가장 먼저 포기할 수 있는 조각.
const CONTEXT: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" };
// 최소화 = 닫기 통합이라 이 칩 스트립이 창을 되찾는 유일한 입구 → 칩이 있으면 컨텍스트보다 먼저 폭을 확보한다.
// (칩이 없을 땐 최소 폭 없음 = 컨텍스트가 다 쓴다.)
const CHIP_STRIP_MIN = 72;
function chipStripStyle(count: number): React.CSSProperties | undefined {
    return count > 0 ? { minWidth: CHIP_STRIP_MIN } : undefined;
}
function planeDot(color: string): React.CSSProperties {
    return { display: "inline-block", width: 5, height: 5, borderRadius: 999, background: color, flexShrink: 0 };
}

// 복기·분석 그룹(🟢) — 라벨 + 종목·날짜·시간(날짜/시간은 붙여 "복기 시점"으로) + 이 플레인 최소화 창 칩.
function EodPlaneGroup({ code, date, setDate, time, setTime, chips }: {
    code: string;
    date: string;
    setDate: (d: string) => void;
    time: string | null;
    setTime: (t: string | null) => void;
    chips: JSX.Element[];
}): JSX.Element {
    const wheelRef = useHorizontalWheel<HTMLSpanElement>();
    return (
        <span style={REGION}>
            <span style={CONTEXT}>
                <span style={planeDot("var(--plane-eod)")} title="분석(복기) 플레인" />
                <span className="plane-label" style={{ color: "var(--plane-eod)", fontWeight: 600, flexShrink: 0 }}>분석</span>
                <NameCopyControl code={code} />
                {/* 날짜+시간 = 복기 시점 한 덩어리(gap 좁게) */}
                <span style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                    <DatePicker value={date} onChange={setDate} />
                    <TimeControl time={time} setTime={setTime} />
                </span>
            </span>
            <span ref={wheelRef} className="taskbar-chips" style={chipStripStyle(chips.length)}>{chips}</span>
        </span>
    );
}

// 실시간 그룹(🟠) — 라벨 + 종목 + 최근 폴링 시각(HH:MM:SS) + 이 플레인 최소화 창 칩.
function LivePlaneGroup({ code, chips }: { code: string; chips: JSX.Element[] }): JSX.Element {
    const { snapshot } = useLiveSnapshot();
    const wheelRef = useHorizontalWheel<HTMLSpanElement>();
    const live = snapshot?.status === "live";
    const t = snapshot?.ts ? new Date(snapshot.ts).toLocaleTimeString("en-GB") : null;
    return (
        <span style={REGION} title={`실시간 연결: ${snapshot?.status ?? "끊김"}`}>
            <span style={CONTEXT}>
                <span style={planeDot(live ? "var(--plane-live)" : "var(--text-tertiary)")} />
                <span className="plane-label" style={{ color: "var(--plane-live)", fontWeight: 600, flexShrink: 0 }}>실시간</span>
                <NameCopyControl code={code} />
                {t && <span className="tabular" style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>{t}</span>}
            </span>
            <span ref={wheelRef} className="taskbar-chips" style={chipStripStyle(chips.length)}>{chips}</span>
        </span>
    );
}

// 현재 시각(우측·설정 근처) — 매초 갱신. "2026-07-13 (월) 03:33:36".
function Clock(): JSX.Element {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    return <span className="tabular" style={{ color: "var(--text-secondary)", fontSize: 11 }} title="현재 시각">{fmtStampKo(now)}</span>;
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
                overflow: "hidden", // 플레인 스트립이 각자 스크롤 — 바 전체는 절대 넘치거나 줄바꿈되지 않게
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
                    flexShrink: 0,
                }}
            >
                화면 {activePreset ?? "—"}
            </button>
            <span style={sep}>│</span>
            <LivePlaneGroup code={liveCode} chips={chips(liveClosed, "live")} />
            <span style={sep}>│</span>
            <EodPlaneGroup code={focusCode} date={date} setDate={setDate} time={focusTime} setTime={setTime} chips={chips(eodClosed, "eod")} />
            {/* 우측: 미러 동기화 + 현재 시각 + 설정 */}
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <MirrorSync />
                <Clock />
                <span style={sep}>│</span>
                <GearButton onClick={() => openSettings()} />
            </span>
        </div>
    );
}
