// 「시장 단면」 판(옛 테마 순위 — 2026-09-26 개명) — 어느 분의 전 종목 단면 산점 + 테마 동료 강조.
// 축 자유(창 = 임의 분 입력, 대금/등락 각 순위|값). 존 선은 「존 ▾」에서 고른 테마 조건의 **복사본**이다
// (2026-09-30 — 옛 "첫 켜진 테마 조건 자동 겹침" 폐지: 참조가 아니라 복사라 원본을 고쳐도 판은 안 흔들린다).
// 연동이 원리적으로 없다:
// 판정(컷·존·✓/✗·카운트·재적 띠) 코드가 이 파일에 아예 없다 — 종류 분리가 "연동해 놓고 값 모드로
// 돌려 판정이 조용히 꺼지는" 경로를 코드 구조로 막는다(2026-09-17 판 이원화, decisions.md).
// 십자선은 항상 자유 자(회색·인스턴스 영속)다. 검색(조건화)은 조건판·편성 보드의 몫.
import { useEffect, useMemo } from "react";
import { usePanelHeader } from "../../components/header/registry.js";
import { SubjectBadge } from "../../components/SubjectBadge.js";
import { useDock } from "../../store/dock.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { subjectStatus } from "../../lib/subject.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { AxisControls } from "./AxisControls.js";
import { ThemeLensStrip } from "./ThemeLensStrip.js";
import { ThemePlaneView } from "./ThemePlaneView.js";
import { parseThemeRankAxes, windowLabel } from "./axisModel.js";
import { parseRateTicks } from "./rateTicks.js";
import { amountTickWindowKey, parseAmountTicks, withWindowTicks } from "./amountTicks.js";
import { selectObservedExpr, useWorkbench } from "../../store/workbench.js";
import { themeZoneLabel } from "../filter/themeLabel.js";
import { MENU_PAD, MenuHead, MenuItem, MenuSep } from "../../ui/popover/menu.js";
import { DEFAULT_THEME_ZONE } from "@trade-data-manager/market/domain";
import { defaultScopeZone, parseScopeZone, themeZoneSourcesOf, type ScopeZone } from "./zoneSources.js";
import { fmtMin, useThemePlane } from "./useThemePlane.js";

export function ThemeScopePanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const { nameOf } = useStockNamesDict();

    // 축 설정 — 인스턴스 영속(⧉ 복제 시 사본이 같이 간다). 관찰판만의 손잡이다.
    const [axesRaw, setAxesRaw] = usePanelUi<unknown>(panelId, "axes", null);
    const axes = useMemo(() => parseThemeRankAxes(axesRaw), [axesRaw]);
    // % 눈금 값 — 별도 키(부재 = 기본 0·5·10·20, [] = 끔). axes 에 안 넣는 이유: 기하 memo 가 칩 편집마다 재계산된다.
    const [rateTicksRaw, setRateTicks] = usePanelUi<unknown>(panelId, "rateTicks", undefined);
    const rateTicks = useMemo(() => parseRateTicks(rateTicksRaw), [rateTicksRaw]);
    // 억 눈금 값 — **창별** 저장물(Record<창키, 억 목록>, 기본 = 빈 목록). 쓰기는 함수형 병합 — 통째로
    // 쓰면 다른 창의 목록이 날아간다(usePanelUi 가 store 최신값을 읽어 준다).
    const [amountTicksRaw, setAmountTicksRaw] = usePanelUi<unknown>(panelId, "amountTicks", undefined);
    const amountTickKey = amountTickWindowKey(axes.windowMin);
    const amountTicks = useMemo(() => parseAmountTicks(amountTicksRaw)[amountTickKey] ?? EMPTY_TICKS, [amountTicksRaw, amountTickKey]);
    const setAmountTicks = (next: number[]): void =>
        setAmountTicksRaw((prev: unknown) => withWindowTicks(parseAmountTicks(prev), amountTickKey, next));
    const plane = useThemePlane(panelId, axes, rateTicks, amountTicks);
    const { subject, section } = plane;

    // 자 키는 모드별(창 무시 — 임의 분이라 창을 키에 넣으면 무한히 번진다. 조건판과 키 규칙이 다른 건 의도).
    const guideKeys = useMemo(() => ({ x: `x:${axes.xMode}`, y: `y:${axes.yMode}` }), [axes.xMode, axes.yMode]);

    // 탭 제목 = 카탈로그 이름 그대로 — 축 꼬리표("· 30분 값") 폐지(2026-09-17 사용자: 헤더가 이미
    // 말한다). 옛 저장 배치에 꼬리 붙은 제목이 남아 있으니 다르면 되돌리는 정규화를 겸한다.
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    const axisSummary = `${windowLabel(axes.windowMin)} 대금 ${axes.xMode === "rank" ? "순위" : "값"} × 등락 ${axes.yMode === "rank" ? "순위" : "값"}`;

    // 존 — 「존 ▾」에서 고른 조건의 **사본**(panelUi "zone", ⧉ 복제 시 같이 간다). 고를 때 창·축 모드도 그
    // 조건에 맞추지만, 그 뒤 손으로 축을 바꾸면 **축이 일치하는 변만** 긋는다(다른 창의 N 을 이 축에 그으면 거짓말).
    const [zoneRaw, setZone] = usePanelUi<unknown>(panelId, "zone", null);
    const zone = useMemo(() => parseScopeZone(zoneRaw), [zoneRaw]);
    const pickZone = (z: ScopeZone | null): void => {
        setZone(z);
        if (z) setAxesRaw({ ...axes, windowMin: z.window, xMode: "rank", yMode: z.rate.mode });
    };
    const overlay = useMemo(() => {
        if (!zone) return null;
        const x = axes.xMode === "rank" && axes.windowMin === zone.window ? zone.zoneAmountN : null;
        const y = axes.yMode === zone.rate.mode
            // 값 축은 **하한만** 선이 된다 — 틴트가 선의 위(≥ 쪽)를 칠하므로 상한을 넘기면 존 밖을 존처럼 칠한다
            // (리뷰 지적). 상한만인 존은 겹침을 안 세운다 · 양끝이면 틴트가 상한 위로 번지는 건 알려진 근사.
            ? (zone.rate.mode === "rank" ? zone.rate.max : zone.rate.minPct ?? null)
            : null;
        return x === null && y === null ? null : { x, y };
    }, [zone, axes]);

    // ── 헤더 선언 — 축·존은 **정보(요약)와 컨트롤(판)으로 갈라** 중복 선언한다(규약: 섞인 표면 분리).
    // 판 내용(AxisControls·ZoneMenu)은 그대로, 껍데기는 판형 컨트롤을 연 쪽(팝오버 공용층)이 진다.
    usePanelHeader(panelId, {
        info: [
            {
                id: "axis", name: "축 요약",
                help: "이 창의 축 — 편집은 컨트롤 판의 「축」(인스턴스마다 따로 저장, ⧉ 복제 시 사본이 같이 간다)",
                text: () => `축: ${axisSummary}`,
            },
            {
                id: "zone", name: "존 출처", tone: "accent",
                help: zone
                    ? `빨간 점선 = 「${zone.from}」의 존 정의 사본(원본을 고쳐도 안 따라간다 · 축·창이 일치하는 변만). 판정 없음`
                    : "걸린 테마 조건에서 존 값을 복사해 빨간 점선으로 겹친다 — 컨트롤 판의 「존」",
                text: () => (zone ? `존: ${zone.from}` : null),
            },
            {
                id: "zoneHidden", name: "존 선 상태", transient: true,
                help: "존의 창·모드와 지금 축이 달라 선을 긋지 않는다 — 「존」에서 다시 고르면 축이 맞춰진다",
                text: () => (zone && overlay === null ? "존 선 숨김(축 다름)" : null),
            },
            {
                id: "subject", name: "주체", tabular: true,
                help: "지금 단면의 주체(전역 시선의 종목·날짜·분)",
                text: () => (subject ? `${nameOf(subject.code)} · ${subject.date}${plane.minute !== null ? ` ${fmtMin(plane.minute)}` : ""}` : null),
            },
            {
                id: "subjectBadge", name: "주체 배지", text: () => null,
                help: "주체가 이 단면에 서 있는지(값 없음·숨김)",
                renderLine: () => (
                    <SubjectBadge subject={subject} name={subject ? nameOf(subject.code) : undefined} absentLabel="그 분 값 없음"
                        status={section
                            ? subjectStatus(
                                section.indexOf(subject?.code ?? "") !== null && plane.participants.some((p) => p.code === subject?.code),
                                plane.participants.some((p) => p.code === subject?.code),
                            )
                            : "shown"} />
                ),
            },
        ],
        controls: [
            {
                kind: "popover", id: "axes", name: "축 설정", label: "축", width: 340, nav: true,
                help: "이 창의 축 설정 — 인스턴스마다 따로 저장된다(⧉ 복제 시 사본이 같이 간다)",
                renderPopover: () => <AxisControls axes={axes} onChange={setAxesRaw} rateTicks={rateTicks} onRateTicks={setRateTicks} amountTicks={amountTicks} onAmountTicks={setAmountTicks} />,
            },
            {
                kind: "popover", id: "zone", name: "존 겹침", label: zone !== null ? zone.from : "존", width: 360, nav: true, on: zone !== null, activeColor: "var(--accent-primary)",
                help: "걸린 테마 조건에서 존 값을 복사해 빨간 점선으로 겹친다(판정 없음 — 조건은 일별 타점 [생성])",
                renderPopover: (close) => <ZoneMenu zone={zone} onPick={(z) => { pickZone(z); close(); }} />,
            },
        ],
    });

    return (
        <div style={wrap}>
            {/* 렌즈 칩 — 시선 도구(판정 진단은 조건판 몫이라 verdicts 없음 = 이름만). */}
            {(plane.subjectThemes.length > 0 || (subject !== null && plane.themesStatus !== "ready")) && (
                <div style={chipsRow}>
                    <ThemeLensStrip themes={plane.subjectThemes} lens={plane.lens} verdicts={null} colorOf={plane.themeColors} status={plane.themesStatus}
                        onPick={plane.setLens} />
                </div>
            )}

            <ThemePlaneView plane={plane} guideKeys={guideKeys} overlay={overlay} />
        </div>
    );
}

/** 「존 ▾」 판 — 보는 집합의 테마 조건 전부(묶음 속·꺼진 줄 포함). 고르면 존 정의를 **복사**한다. */
function ZoneMenu({ zone, onPick }: { zone: ScopeZone | null; onPick: (z: ScopeZone | null) => void }): JSX.Element {
    const expr = useWorkbench(selectObservedExpr);
    const sets = useWorkbench((s) => s.savedSets);
    const sources = useMemo(() => themeZoneSourcesOf(expr, sets), [expr, sets]);
    const def = defaultScopeZone();
    return (
        <div style={{ padding: MENU_PAD }}>
            <MenuHead title="고르면 그 조건의 존 정의(창·대금 순위·등락 축)를 이 판에 복사한다 — 참조가 아니라 원본을 고쳐도 안 따라간다. 컷(재적·순위)은 판정이라 안 가져온다">
                걸린 테마 조건
            </MenuHead>
            {sources.length === 0 && (
                <div style={{ padding: "2px 12px", fontSize: 11, color: "var(--text-tertiary)" }}>보는 집합에 테마 조건이 없다</div>
            )}
            {sources.map((src) => (
                <MenuItem key={src.key} mark="radio" on={zone?.key === src.key} dim={!src.enabled}
                    title={src.enabled ? src.label : `${src.label} — 꺼진 줄(복사는 된다)`}
                    onClick={() => onPick(src.zone)}>
                    {src.label}
                </MenuItem>
            ))}
            <MenuSep />
            <MenuItem mark="radio" on={zone?.key === def.key} onClick={() => onPick(def)}
                title={`테마 조건 기본값의 존 — ${themeZoneLabel(DEFAULT_THEME_ZONE)}`}>
                기본값으로
            </MenuItem>
            <MenuItem mark="radio" on={zone === null} onClick={() => onPick(null)} title="존 선을 안 긋는다">
                끄기
            </MenuItem>
        </div>
    );
}

/** 창에 목록이 없을 때의 고정 참조 — 매 렌더 새 [] 는 플레인 memo 를 공으로 돌린다. */
const EMPTY_TICKS: number[] = [];

const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const chipsRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", flexShrink: 0 };
