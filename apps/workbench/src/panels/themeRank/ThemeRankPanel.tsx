// 테마 순위 **조건판** — 순위×순위 고정(창 = 연동 행의 zoneAmountWindow: 당일|60분), 테마 조건의
// 유일한 편집면. 축 노브가 없다 — 조건판은 창이 곧 정체성이다(2026-09-17 판 이원화, decisions.md).
//
// 연동은 **pull·1:1·영속**: 결정권은 집합 편성 보드(행 펼침의 연동 목록)에 있고, 이 판은
// wb.themeRankBindings 에서 "나를 가리키는 행"을 찾아 비출 뿐이다. 옛 세션 연동 포인터·칩 스트립·
// 자동 첫 행 연동은 폐지. 연동 중 십자선 = 그 행의 N/M(드래그 = 술어 편집, 커밋 = 손 뗄 때 한 번),
// 미연동 = 자유 자(회색). 연동이 풀리면 마지막 N/M 을 자로 스냅샷해 선이 이어진다("선은 항상 있다").
//
// 자유 축 탐색(임의 분 창·값 산점)은 관찰판(ThemeScopePanel)의 몫 — 종류 분리가 "연동해 놓고 값
// 모드로 돌려 판정이 조용히 꺼지는" 경로를 원천 봉쇄한다.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DAILY_GEN_PANEL_ID } from "../dailyGen/dailyPanelIds.js";
import { PanelHeader } from "../../components/ControlChrome.js";
import { SubjectBadge } from "../../components/SubjectBadge.js";
import { HeaderPopover } from "../../components/HeaderPopover.js";
import { useWorkbench, selectEditingStages } from "../../store/workbench.js";
import { useDock } from "../../store/dock.js";
import { usePanelUi } from "../../store/usePanelUi.js";
import { themeStrengthLabel } from "../filter/label.js";
import { themeParamsOf } from "../filter/themeLink.js";
import { subjectStatus } from "../../lib/subject.js";
import { useStockNamesDict } from "../../lib/StockNamesContext.js";
import { openAndFocus } from "../../lib/openPanel.js";
import { useThemeStrengthStats } from "../../lib/useThemeStrengthStats.js";
import { anyConditionOn, DEFAULT_THEME_STRENGTH, themeVerdicts, type ThemeStrengthParams, type ThemeVerdict } from "../../lib/themeStrength.js";
import { projectionOf } from "../../lib/useThemeProjection.js";
import { parseSlotId } from "../../shell/panelSlots.js";
import { FILTER } from "../../styles/palette.js";
import { ThemeLensStrip } from "./ThemeLensStrip.js";
import { ThemeParamControls } from "./ThemeParamControls.js";
import { ThemePlaneView, type CutModel } from "./ThemePlaneView.js";
import { bandSegmentsOf, subjectOrdinalTrack } from "./zoneTrack.js";
import { fmtMin, useThemePlane } from "./useThemePlane.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import type { ThemeRankAxes } from "./axisModel.js";

export function ThemeRankPanel({ panelId, baseTitle }: { panelId: string; baseTitle?: string }): JSX.Element {
    const { nameOf } = useStockNamesDict();
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);

    // ── 연동 행 — 영속 바인딩의 역방향(나를 가리키는 행). 고아(행 소멸)는 여기서 자연히 미연동이 된다.
    const bindings = useWorkbench((s) => s.themeBindings);
    const stages = useWorkbench(selectEditingStages);
    const linked = useMemo(() => {
        const stageId = Object.entries(bindings).find(([, pid]) => pid === panelId)?.[0];
        if (stageId === undefined) return null;
        return stages.find((s) => s.id === stageId && s.predicates[0]?.kind === "themeStrength") ?? null;
    }, [bindings, stages, panelId]);
    const linkedParams = useMemo(() => (linked ? themeParamsOf(linked) : null), [linked]);

    // 조건판의 축은 고정 — 창만 연동 행이 정한다(미연동 = 당일).
    const win: 0 | 60 = linkedParams?.zoneAmountWindow === 60 ? 60 : 0;
    const axes = useMemo((): ThemeRankAxes => ({ xMode: "rank", yMode: "rank", windowMin: win === 60 ? 60 : null }), [win]);
    const plane = useThemePlane(panelId, axes);
    const { subject, section } = plane;

    // ── 컷선 드래그 — 미리보기는 로컬, 커밋은 손 뗄 때 한 번(Rail 규약) 연동 행의 술어로.
    // ⚠ 커밋을 setPreview 업데이터 안에서 하면 안 된다 — 업데이터는 다음 렌더 중에 돌 수 있어
    //   "렌더 중 다른 컴포넌트(FunnelProvider) 업데이트" React 에러가 난다(2026-09-17 실측이 잡음).
    //   최신 미리보기는 ref 미러로 들고, 커밋은 이벤트 핸들러에서 직접 술어를 쓴다.
    const [preview, setPreview] = useState<Partial<ThemeStrengthParams> | null>(null);
    const previewRef = useRef<Partial<ThemeStrengthParams> | null>(null);
    const eff: ThemeStrengthParams = useMemo(
        () => ({ ...(linkedParams ?? DEFAULT_THEME_STRENGTH), ...preview }),
        [linkedParams, preview],
    );
    const patchLinked = (patch: Partial<ThemeStrengthParams>): void => {
        if (linked && linkedParams) setPredicates(linked.id, [{ kind: "themeStrength", params: { ...linkedParams, ...patch } }]);
    };
    const cut = useMemo((): CutModel | null => {
        if (linkedParams === null) return null;
        return {
            rateN: eff.zoneRateN,
            amountN: eff.zoneAmountN,
            onPreview: (patch) => {
                const next = { ...(previewRef.current ?? {}), ...patch };
                previewRef.current = next;
                setPreview(next);
            },
            onCommit: () => {
                const p = previewRef.current;
                previewRef.current = null;
                setPreview(null);
                if (p) patchLinked(p);
            },
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkedParams, eff.zoneRateN, eff.zoneAmountN, linked?.id]);

    // 연동 해제/행 소멸 시 마지막 N/M 을 자로 스냅샷 — "선은 항상 있다"의 승계 규칙. 스냅샷 주체는 판
    // (guides 는 panelId 낟알 panelUi — 보드가 남의 panelUi 를 원격으로 쓰면 소유가 흐려진다).
    const [, setGuides] = usePanelUi<Record<string, number>>(panelId, "guides", {});
    const guideKeys = useMemo(() => ({ x: `x:rank:${win}`, y: "y:rank" }), [win]);
    const prevLinked = useRef<{ rateN: number; amountN: number } | null>(null);
    useEffect(() => {
        if (linkedParams !== null) {
            // 연동 중엔 매 변경마다 갱신 — 해제 순간의 스냅샷이 "마지막" 값이어야 한다(연동 시점 값이 아니라).
            prevLinked.current = { rateN: linkedParams.zoneRateN, amountN: linkedParams.zoneAmountN };
            return;
        }
        const last = prevLinked.current;
        if (last) {
            prevLinked.current = null;
            // 해제 후 판은 당일 공간(win 0)으로 돌아가 `x:rank:0` 을 읽는다 — 스냅샷도 그 키에 쓴다
            // (60분 키에 쓰면 화면이 안 읽는 유령 저장물이 된다).
            setGuides((g) => ({ ...g, "x:rank:0": last.amountN, "y:rank": last.rateN }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linkedParams === null, linkedParams?.zoneRateN, linkedParams?.zoneAmountN]);

    // ── 카운트 — 열린 바인딩 조건판 중 **최소 슬롯 하나만** 단다(useThemeStrengthStats 의 1-엔트리
    // 모듈 캐시가 물리적 근거 — 서로 다른 params 로 N개가 켜지면 캐시가 프레임마다 서로를 밀어낸다).
    const openPanelIds = useDock((s) => s.openPanelIds);
    const countOwner = useMemo(() => {
        if (linkedParams === null) return false;
        // 고아 바인딩(행이 죽은 항목)은 후보에서 뺀다 — 끼면 그 판이 최소 슬롯을 차지한 채 카운트를
        // 안 달아(자기는 미연동) 전 판에서 카운트가 사라진다.
        const boundOpen = Object.entries(bindings)
            .filter(([sid, pid]) => openPanelIds?.includes(pid) && stages.some((s) => s.id === sid && s.predicates[0]?.kind === "themeStrength"))
            .map(([, pid]) => parseSlotId(pid)?.n ?? Infinity);
        const mine = parseSlotId(panelId)?.n ?? Infinity;
        return boundOpen.length === 0 || mine <= Math.min(...boundOpen);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bindings, stages, openPanelIds, panelId, linkedParams === null]);
    const countParams = useDeferredValue(eff);
    const count = useThemeStrengthStats(countParams, linkedParams !== null && countOwner);

    // ── 렌즈 진단(✓/✗ = 그 테마 단독 통과) — 연동일 때만(활성 조건 없으면 소음이라 null).
    // 인덱스는 plane 내부와 같은 공용 훅(RQ 캐시 공유) — 투영도 모듈 캐시(인덱스 참조 키)라 이중 비용 없음.
    const proj = projectionOf(useThemeIndex().index);
    const verdicts = useMemo((): ReadonlyMap<string, ThemeVerdict> | null => {
        if (!subject || !section || linkedParams === null || !anyConditionOn(eff)) return null;
        return new Map(themeVerdicts(subject.code, section, eff, proj).map((v) => [v.theme, v] as const));
    }, [subject, section, linkedParams, eff, proj]);

    // ── 타임라인 재적 띠 — 연동일 때만 트랙을 굽는다(~390분 × 정렬).
    const hasLink = linkedParams !== null;
    const track = useMemo(
        () => (hasLink && plane.stocks && subject && plane.minuteRange ? subjectOrdinalTrack(plane.stocks, subject.date, subject.code, plane.minuteRange) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasLink, plane.stocks, subject?.code, subject?.date, plane.minuteRange],
    );
    const segments = useMemo(
        () => (track && plane.minuteRange && hasLink ? bandSegmentsOf(track, plane.minuteRange.lo, plane.minuteRange.hi, eff.zoneRateN, eff.zoneAmountN, eff.zoneAmountWindow) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [track, plane.minuteRange, hasLink, eff.zoneRateN, eff.zoneAmountN, eff.zoneAmountWindow],
    );

    // 탭 제목 = 카탈로그 이름 그대로 — 설정 꼬리표("· 60분") 폐지(2026-09-17 사용자: 헤더가 이미
    // 말한다). 옛 저장 배치에 꼬리 붙은 제목이 남아 있으니 다르면 되돌리는 정규화를 겸한다.
    useEffect(() => {
        if (!baseTitle) return;
        const p = useDock.getState().api?.getPanel(panelId);
        if (p && p.title !== baseTitle) p.api.setTitle(baseTitle);
    }, [panelId, baseTitle]);

    return (
        <div style={wrap}>
            <PanelHeader chrome={false} gap={8} style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-primary)" }}>
                {/* 연동 배지 — 어느 행을 비추는 중인가(미연동이면 그 사실). 연동 손잡이는 보드에 있다(pull). */}
                {linked !== null && linkedParams !== null ? (
                    <span style={{ ...label, color: "var(--accent-primary)", border: "1px solid var(--accent-primary)", background: "var(--accent-soft)", borderRadius: 8, padding: "0 6px" }}
                        title="연동 중 — 십자선·조건 ▾ 가 이 행의 술어를 직접 고친다(사본 없음). 연동 변경/해제는 조건 보드에서(지금은 종단 보류 — 하루 생성소엔 테마 입구가 없다)">
                        ▣ {themeStrengthLabel(linkedParams)}
                    </span>
                ) : (
                    <button onClick={() => openAndFocus(DAILY_GEN_PANEL_ID)}
                        style={{ ...label, color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        title="테마 강도 조건은 종단 조건이라 지금(하루 모드) 생성소에 입구가 없다 — 클릭하면 생성소를 연다">
                        미연동 — 하루 생성소엔 테마 입구 없음 ▸
                    </button>
                )}
                {linked !== null && !linked.enabled && (
                    <span title="연동 행이 꺼져 있어 깔때기에 안 낀다 — 카운트는 켰을 때의 값(탐색용)"
                        style={{ ...label, color: "var(--text-tertiary)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "0 6px" }}>
                        꺼짐
                    </span>
                )}
                {linkedParams !== null && (
                    <span style={label} title="연동 행의 조건을 타점 모수 전체에 적용한 수 — 통과/판정가능. 결손 = 단면 없음(오늘 이후·미수집)">
                        {count.error ? <span style={{ color: FILTER }}>모수 재료 오류</span>
                            : !countOwner ? <span style={{ color: "var(--text-tertiary)" }} title="카운트는 열린 바인딩 판 중 최소 슬롯 하나만 단다">—</span>
                                : count.isLoading ? "…"
                                    : anyConditionOn(countParams)
                                        ? <>통과 {count.passed.toLocaleString()} / {count.evaluable.toLocaleString()}{count.missing > 0 && <span style={{ color: "var(--text-tertiary)" }}> · 결손 {count.missing}</span>}</>
                                        : <span style={{ color: "var(--text-tertiary)" }}>조건 없음 — 판정가능 {count.evaluable.toLocaleString()}</span>}
                    </span>
                )}
                {/* 조건 ▾ — 컷으로 못 그리는 값들(± 스텝·하위조건 토글·창·기준). 굵은 조정은 여전히 컷 배지 드래그. */}
                {linked !== null && linkedParams !== null && (
                    <HeaderPopover width={560} align="start"
                        trigger={(open, toggle) => (
                            <button onClick={toggle} style={{ ...label, cursor: "pointer", border: "1px solid var(--border-default)", borderRadius: 8, padding: "0 6px", background: open ? "var(--bg-tertiary)" : "none" }}
                                title="연동 행의 파라미터 — 열어둔 채 산점을 만질 수 있다(Esc 로 닫기)">
                                조건 ▾
                            </button>
                        )}>
                        {() => <ThemeParamControls params={linkedParams} onPatch={patchLinked} />}
                    </HeaderPopover>
                )}
                {subject && (
                    <span style={{ ...label, color: "var(--text-tertiary)" }}>
                        {nameOf(subject.code)} · {subject.date}{plane.minute !== null && ` ${fmtMin(plane.minute)}`}
                    </span>
                )}
                <SubjectBadge subject={subject} name={subject ? nameOf(subject.code) : undefined} absentLabel="그 분 순위 없음"
                    status={section
                        ? subjectStatus(
                            section.indexOf(subject?.code ?? "") !== null && plane.participants.some((p) => p.code === subject?.code),
                            plane.participants.some((p) => p.code === subject?.code),
                        )
                        : "shown"} />
            </PanelHeader>

            {/* 렌즈 칩 — 시선 종목의 테마(갈라 보기 + 연동 시 ✓/✗ 진단). 시선 도구라 연동과 무관하게 선다. */}
            {(plane.subjectThemes.length > 0 || (subject !== null && plane.themesStatus !== "ready")) && (
                <div style={chipsRow}>
                    <ThemeLensStrip themes={plane.subjectThemes} lens={plane.lens} verdicts={verdicts} colorOf={plane.themeColors} status={plane.themesStatus}
                        onPick={plane.setLens} />
                </div>
            )}

            <ThemePlaneView plane={plane} cut={cut} guideKeys={guideKeys} segments={segments} />
        </div>
    );
}

const wrap: React.CSSProperties = { display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)", overflow: "hidden" };
const label: React.CSSProperties = { fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 };
const chipsRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderBottom: "1px solid var(--border-subtle)", overflowX: "auto", flexShrink: 0 };
