// 필터 보드 — 레일이 아닌 조건들(그룹·테마)이 서는 자리.
//
// ⚠ **1차원 레일(축·날짜·시간)은 여기 없다** — 전용 「필터 레일」 패널로 이사했다(RailPanel).
// 두 화면은 같은 stages 저장소를 다른 렌즈로 그린다(사본이 없어 동기화 개념도 없다).
//
// 그룹만 리스트인 이유: 축은 존재 자체가 자리를 정하지만 그룹은 그런 고정 자리가 없고, 게다가 그룹
// 조건은 여러 필터로 나누는 게 의미가 있다(각각의 한계 기여도가 따로 나온다).
//
// 층위 칸이 곧 선언이다 — 하루 칸에는 하루 그룹이, 타점 칸에는 타점 그룹이 산다. 한 필터는 한 층위여야
// "하루가 먼저"라는 깔때기 순서가 성립한다(stage.ts 의 층위 규칙).
import { useMemo, useState } from "react";
import { useGroups } from "../../lib/GroupsContext.js";
import { selectFilterStages, useWorkbench } from "../../store/workbench.js";
import { useFunnel } from "./FunnelContext.js";
import { GroupEditors, type GroupEditorAnchor } from "./BoardEditors.js";
import { rowIdOfStage, useBoardReveal, type BoardReveal } from "./boardReveal.js";
import { GroupExprChips, namingOf } from "./GroupExprChips.js";
import { useGroupCreateFlow } from "./useGroupCreateFlow.js";
import { GRAIN_TITLE, GrainSection, Note } from "./grain.js";
import { BoardRow } from "./BoardRow.js";
import { ThemeSection } from "./ThemeRow.js";
import { THEME_LINK_KEY, THEME_LINK_SCOPE } from "./themeLink.js";
import type { FilterPredicate, Grain } from "./stage.js";
import { stageKind } from "./stage.js";

const GRAINS: Grain[] = ["day", "point"];

export function FilterBoard({ reveal, onlyActive }: {
    reveal: BoardReveal | null;
    /** 조건이 걸린 줄만 보기 — 손잡이는 패널의 컨트롤 바에 있다(보드 안에 두면 목록의 일부로 읽힌다). */
    onlyActive: boolean;
}): JSX.Element {
    const v = useFunnel();
    const stages = useWorkbench(selectFilterStages);
    const addStage = useWorkbench((s) => s.addFilterStage);
    const setPredicates = useWorkbench((s) => s.setFilterStagePredicates);
    const removeStage = useWorkbench((s) => s.removeFilterStage);
    const gv = useGroups();

    const [editor, setEditor] = useState<GroupEditorAnchor | null>(null);
    // 그룹 생성 — 편집기가 열린 동안 draft 에 쌓고, 닫을 때 내용이 있으면 그때 필터가 된다(이중 커밋 가드 포함).
    const groupCreate = useGroupCreateFlow(addStage, setEditor);

    const grainOf = useMemo(() => new Map(v.stagesOrdered.map((e) => [e.stage.id, e.grain])), [v.stagesOrdered]);

    // 되짚기 — 그 조건이 사는 줄로 스크롤 + 강조(boardReveal). 테마 행은 접혀 있으면 레일이 DOM 에
    // 없으므로 **먼저 연동(=펼침)**한다.
    const setSessionUi = useWorkbench((s) => s.setSessionUi);
    const { registerRow, flash } = useBoardReveal(reveal, stages, {
        onBeforeScroll: (rowId) => {
            if (rowId.startsWith("theme:")) setSessionUi(THEME_LINK_SCOPE, THEME_LINK_KEY, rowId.slice("theme:".length));
        },
    });

    /** 이 줄을 그릴까 — "걸린 것만"이 켜져 있으면 조건이 있는 줄만. */
    const visible = (has: boolean): boolean => !onlyActive || has;

    const naming = useMemo(() => namingOf(gv), [gv]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            {/* 가로 8px — 필터 막대 목록과 같은 여백. 층위 칸(GrainSection)의 세로선이 두 화면에서 같은 자리에 서야 한다. */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 8px 0" }}>
                {/* 사전이 오기 전엔 그리지 않는다 — 빈 줄은 "그룹이 없다"고 말하는데 그건 사실이 아니다. */}
                {v.isLoading && <Note>불러오는 중…</Note>}
                {!v.isLoading && GRAINS.map((grain) => {
                    const groupStages = stages.filter((s) => stageKind(s) === "group" && (grainOf.get(s.id) ?? "day") === grain);

                    return (
                        <div key={grain}>
                            <GrainSection grain={grain}>
                                {/* 그룹 — 유일하게 리스트인 조건(순서가 없어 레일이 안 된다). 그래도 **레일과 같은 행 격자**에
                                    둔다: 이름 열이 레일 패널의 축 이름들과 세로로 맞아야 같은 목록 문법으로 읽힌다. */}
                                {visible(groupStages.length > 0) && (
                                    <>
                                        {groupStages.map((s, i) => {
                                            const expr = (s.predicates.find((p) => p.kind === "group") as Extract<FilterPredicate, { kind: "group" }> | undefined)?.expr ?? { groups: [] };
                                            const rowId = rowIdOfStage(s);
                                            return (
                                                <BoardRow key={s.id} innerRef={registerRow(rowId)} label={i === 0 ? "그룹" : ""}
                                                    flash={flash === rowId} dimmed={!s.enabled}>
                                                    <button onClick={(e) => setEditor({ grain, stageId: s.id, x: e.clientX, y: e.clientY })}
                                                        title="눌러서 이 그룹 조건 고치기 · 끄기·지우기는 위 목록에서"
                                                        style={{ display: "flex", alignItems: "center", width: "100%", height: "100%", border: "none", background: "transparent", padding: 0, cursor: "pointer", textAlign: "left", minWidth: 0 }}>
                                                        <GroupExprChips expr={expr} naming={naming} empty="조건 없음" />
                                                    </button>
                                                </BoardRow>
                                            );
                                        })}
                                        <BoardRow label={groupStages.length === 0 ? "그룹" : ""}>
                                            <button onClick={(e) => groupCreate.open(grain, e.clientX, e.clientY)}
                                                title={`${GRAIN_TITLE[grain]} 층위 그룹 조건 추가 — 여러 개로 나누면 각각의 기여도가 보입니다`}
                                                style={{ fontSize: 10.5, padding: "1px 8px", borderRadius: 4, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer" }}>
                                                + 그룹 조건
                                            </button>
                                        </BoardRow>
                                    </>
                                )}
                            </GrainSection>
                        </div>
                    );
                })}
                {/* ── 테마 칸 — UI 그룹핑이지 층위가 아니다(행 정체성은 타점, decisions.md). */}
                {!v.isLoading && <ThemeSection registerRow={registerRow} flash={flash} onlyActive={onlyActive} />}
                <div style={{ height: 8 }} />
            </div>

            {/* ── 그룹 팔레트(팝오버) — 레일 갈래 셋은 레일 패널이 연다 ── */}
            <GroupEditors editor={editor} stages={stages}
                draft={groupCreate.draft} onDraftChange={groupCreate.setDraft} onCloseCreate={groupCreate.close}
                removeStage={removeStage} setPredicates={setPredicates}
                onClose={() => setEditor(null)} />
        </div>
    );
}
