// 조건 보드 — 집합 편성 패널의 본론. **깔때기에 걸린 것 전부가 여기 한 목록으로 선다.**
//
// 이 판이 지는 일은 관리다: 무엇이 걸렸나(요약 줄) · 얼마나 걸렀나(막대) · 순서(= 어느 필터가 무엇을
// 죽였나) · 켜기/끄기 · 삭제 · 생성(＋ 조건). **값 편집은 여기 없다** — 종류마다 제일 잘 보여주는
// 편집면이 따로 있고(레일 = 필터 레일 패널 · 테마 = 테마 순위 패널 · 그룹 = 그 자리 팝오버),
// 줄의 이름을 누르면 거기로 데려간다.
//
// ⚠ 불변식: **깔때기 참여는 이 목록에서 항상 전부 보인다.** 조건이 어디서 태어나든(레일을 긋든,
// 저장 집합을 갈아 끼우든) 여기 줄로 서야 한다 — 안 보이는데 숫자가 달라지는 사고를 막는 규칙이라
// 새 조건 종류를 더할 때도 이 목록을 지나야 한다.
//
// 하루가 늘 앞이라 "새로 죽임"이 넓은 조건부터 세어진다(순서는 결과가 아니라 서술을 정한다).
// 칸 클릭 = 시선(다중 가능) — 결과 목록은 없다: 멤버 열람은 구독 패널들의 몫이다.
import { useMemo, useState } from "react";
import type { FunnelCell } from "@trade-data-manager/market/domain";
import { openAndFocus } from "../../lib/openPanel.js";
import { DEFAULT_THEME_STRENGTH } from "../../lib/themeStrength.js";
import { useRankSections } from "../../lib/useRankSections.js";
import { useThemeIndex } from "../../lib/useThemeIndex.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { FILTER } from "../../styles/palette.js";
import { Legend, PASS_CELLS } from "./cells.js";
import { FilterRow } from "./FilterRow.js";
import { useFunnel } from "./FunnelContext.js";
import { GrainSection, Note } from "./grain.js";
import { GroupEditors, type GroupEditorAnchor } from "./ConditionEditors.js";
import { useGroupCreateFlow } from "./useGroupCreateFlow.js";
import { RAIL_REVEAL, useRevealSignal } from "./boardReveal.js";
import { useLinkedThemeStage } from "./themeLink.js";
import { stageLabel } from "./label.js";
import { stageKind, type FilterStage, type Grain } from "./stage.js";

const GRAINS: Grain[] = ["day", "point"];
/** 종류별 편집면 — 줄 이름을 누르면 여기로 데려간다. */
const RAIL_PANEL = "filter-rails-1";
const THEME_PANEL = "theme-rank-1";

export function ConditionBoard({ barsOpen }: {
    /** 막대(5칸)와 수치 줄을 편다 — 머리글 토글 하나가 목록 전체를 지배한다. */
    barsOpen: boolean;
}): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench(selectFilterStages);
    const selection = useWorkbench((s) => s.funnelSelection);
    const setSelection = useWorkbench((s) => s.setFunnelSelection);
    const toggleStage = useWorkbench((s) => s.toggleFilterStage);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const moveStage = useWorkbench((s) => s.moveFilterStage);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);

    const [dragId, setDragId] = useState<string | null>(null);
    // 놓일 자리 표시 — 드래그가 되는 줄도 모르던 게 이 목록의 첫 문제였다(손잡이와 이 선이 한 쌍).
    const [overId, setOverId] = useState<string | null>(null);

    // ── 편집면으로 데려가기 ──
    const { send: sendReveal } = useRevealSignal(RAIL_REVEAL);
    const { linkedId, setLinked } = useLinkedThemeStage();
    const [groupEditor, setGroupEditor] = useState<GroupEditorAnchor | null>(null);
    // 그룹 생성 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 필터가 된다(이중 커밋 가드 포함).
    const groupCreate = useGroupCreateFlow(addStage, setGroupEditor);

    const activeIndexOf = (id: string): number => v.active.findIndex((s) => s.id === id);
    const grainOf = (id: string): Grain => v.stagesOrdered.find((e) => e.stage.id === id)?.grain ?? "day";

    /**
     * 줄 이름 클릭 — 그 **종류의 편집면**으로. 레일은 패널 경계를 넘으므로 신호를 남기고 열고(닫혀
     * 있었다면 첫 렌더 전이라 즉시 스크롤이 안 된다 — boardReveal 머리 주석), 테마는 연동을 옮긴 뒤
     * 패널을 세우고, 그룹은 판이 따로 없어 그 자리 팝오버를 연다(보드 밖 층이라 예외).
     */
    const openEditor = (stage: FilterStage, e: React.MouseEvent): void => {
        switch (stageKind(stage)) {
            case "themeStrength":
                setLinked(stage.id);
                openAndFocus(THEME_PANEL);
                return;
            case "group":
                setGroupEditor({ grain: grainOf(stage.id), stageId: stage.id, x: e.clientX, y: e.clientY });
                return;
            default:
                sendReveal(stage.id);
                openAndFocus(RAIL_PANEL);
        }
    };

    // 칸 클릭 — 같은 필터면 칸 토글(누적), 다른 필터면 그 칸 하나로 갈아탄다.
    // 결과는 목록이 아니라 **연동 패널들**이 보여준다(짚는 순간 선택 포인터가 작업 깔때기로 복귀).
    const clickCell = (stageId: string, cell: FunnelCell): void => {
        if (selection?.stageId === stageId) {
            const cells = selection.cells.includes(cell) ? selection.cells.filter((c) => c !== cell) : [...selection.cells, cell];
            setSelection(cells.length > 0 ? { stageId, cells } : null);
        } else setSelection({ stageId, cells: [cell] });
    };

    // 드래그 재정렬 — 같은 칸(층위) 안에서만. store 배열 인덱스로 옮긴다(칸 표시는 파생이라 따라온다).
    const canDropOn = (targetId: string): boolean =>
        dragId !== null && dragId !== targetId && grainOf(dragId) === grainOf(targetId);
    const dropOn = (targetId: string): void => {
        if (!canDropOn(targetId)) return;
        const from = stages.findIndex((s) => s.id === dragId);
        const to = stages.findIndex((s) => s.id === targetId);
        if (from >= 0 && to >= 0) moveStage(from, to);
        setDragId(null);
        setOverId(null);
    };
    const endDrag = (): void => { setDragId(null); setOverId(null); };

    const hasTheme = useMemo(() => stages.some((s) => stageKind(s) === "themeStrength"), [stages]);

    let rowNo = 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && GRAINS.map((grain) => {
                    const entries = v.stagesOrdered.filter((e) => e.grain === grain);
                    return (
                        <GrainSection key={grain} grain={grain}
                            right={grain === "point" && hasTheme ? <ThemeMaterialBadge /> : undefined}>
                            {entries.length === 0 && (
                                <Note>없음 — 아래 <b>＋ 조건</b> 으로 만들거나, 필터 레일에서 그으면 여기 생깁니다</Note>
                            )}
                            {entries.map(({ stage }) => {
                                rowNo++;
                                const ai = activeIndexOf(stage.id);
                                return (
                                    <FilterRow
                                        key={stage.id}
                                        no={rowNo}
                                        stage={stage}
                                        tally={ai >= 0 ? (v.result?.stages[ai] ?? null) : null}
                                        universe={v.universe}
                                        label={stageLabel(stage, v.labelLook)}
                                        dead={v.deadStageIds.includes(stage.id)}
                                        linked={stage.id === linkedId}
                                        showBar={barsOpen}
                                        pickedCells={selection?.stageId === stage.id ? selection.cells : []}
                                        dragging={dragId === stage.id}
                                        dropTarget={overId === stage.id && canDropOn(stage.id)}
                                        onPick={(cell) => clickCell(stage.id, cell)}
                                        onPickPass={() => setSelection({ stageId: stage.id, cells: [...PASS_CELLS] })}
                                        onOpen={(e) => openEditor(stage, e)}
                                        onToggle={() => toggleStage(stage.id)}
                                        onRemove={() => removeStage(stage.id)}
                                        onDragStart={() => setDragId(stage.id)}
                                        onDragEnd={endDrag}
                                        onDragOver={() => setOverId(stage.id)}
                                        onDropOn={() => dropOn(stage.id)}
                                    />
                                );
                            })}
                        </GrainSection>
                    );
                })}

                {!v.isLoading && (
                    <AddCondition
                        onRails={() => openAndFocus(RAIL_PANEL)}
                        onGroup={(grain, e) => groupCreate.open(grain, e.clientX, e.clientY)}
                        onTheme={() => {
                            addStage([{ kind: "themeStrength", params: { ...DEFAULT_THEME_STRENGTH } }]);
                            openAndFocus(THEME_PANEL);
                        }}
                    />
                )}
                {barsOpen && <Legend />}
                <div style={{ height: 8 }} />
            </div>

            {/* 그룹 팔레트(팝오버) — 그룹만 전용 판이 없어 그 자리에서 연다. 레일 갈래는 레일 패널이 진다. */}
            <GroupEditors editor={groupEditor} stages={stages}
                draft={groupCreate.draft} onDraftChange={groupCreate.setDraft} onCloseCreate={groupCreate.close}
                removeStage={removeStage} setPredicates={setPredicates}
                onClose={() => setGroupEditor(null)} />
        </div>
    );
}

/**
 * ＋ 조건 — 조건이 태어나는 입구 하나. 고르면 그 종류의 편집면이 열린다.
 *
 * ⚠ 레일만 **행을 안 만든다**: 계산 축·날짜에는 "기본값"이 없고("5% 위"가 상위 3건인지 300건인지는
 * 분포를 봐야 안다), 이 앱의 규칙은 빈 술어 필터를 남기지 않는 것이다. 그래서 레일은 판으로 데려가고
 * 거기서 긋는 순간 조건이 된다(레일 하나 = 필터 하나). 테마·그룹은 기본값이 뜻을 갖거나 팔레트에서
 * 곧바로 식을 쓰므로 행을 만든다.
 */
function AddCondition({ onRails, onGroup, onTheme }: {
    onRails: () => void;
    onGroup: (grain: Grain, e: React.MouseEvent) => void;
    onTheme: () => void;
}): JSX.Element {
    const [open, setOpen] = useState(false);
    const item = (label: string, hint: string, run: (e: React.MouseEvent) => void): JSX.Element => (
        <button onClick={(e) => { setOpen(false); run(e); }} title={hint}
            style={{
                display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent",
                color: "var(--text-primary)", cursor: "pointer", font: "inherit", fontSize: 11.5, padding: "5px 10px",
            }}>
            {label}
        </button>
    );
    return (
        <div style={{ position: "relative", padding: "6px 2px 2px" }}>
            <button onClick={() => setOpen(!open)}
                title="조건 만들기 — 종류를 고르면 그 조건의 편집면이 열립니다"
                style={{ fontSize: 11, padding: "2px 9px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>
                ＋ 조건 {open ? "▴" : "▾"}
            </button>
            {open && (
                <div style={{
                    position: "absolute", left: 2, bottom: "100%", zIndex: 5, minWidth: 210,
                    background: "var(--bg-primary)", border: "1px solid var(--border-default)", borderRadius: 5,
                    boxShadow: "0 2px 8px rgba(0,0,0,.12)", padding: "3px 0",
                }}>
                    {item("레일 — 계산 축 · 날짜 · 시간", "필터 레일 판으로 — 분포를 보며 그으면 그 자리에서 조건이 됩니다(빈 조건은 안 만듭니다)", onRails)}
                    {item("그룹 조건 (하루)", "종목·날짜 층위 그룹 식 — 여러 개로 나누면 각각의 기여도가 보입니다", (e) => onGroup("day", e))}
                    {item("그룹 조건 (타점)", "종목·날짜·시각 층위 그룹 식", (e) => onGroup("point", e))}
                    {item("테마 강도", "기본값으로 켜진 행을 만들고 테마 순위 패널에서 엽니다", onTheme)}
                </div>
            )}
        </div>
    );
}

/**
 * 테마 재료 오류 배지 — 재료가 죽으면 테마 행이 멀쩡한 필터처럼 보이면서 결과만 전부 미배치가 된다.
 * 숫자와 화면이 같은 이야기를 해야 하므로(라벨 GONE 규칙과 같은 결) 칸 머리에서 한 번 말한다.
 */
function ThemeMaterialBadge(): JSX.Element | null {
    const sections = useRankSections();
    const themes = useThemeIndex();
    const err = sections.error ?? themes.error;
    if (!err) return null;
    return (
        <span title={`테마 재료 로드 실패 — 테마 필터는 전부 미배치로 세어집니다: ${err.message}`}
            style={{ fontSize: 10, color: FILTER, border: `1px solid ${FILTER}`, borderRadius: 8, padding: "0 6px" }}>
            재료 오류
        </span>
    );
}
